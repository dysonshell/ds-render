'use strict';
var assert = require('assert');
var Ractive = require('ractive');
var htmlExtReg = /\.html$/i;
var path = require('path');
var fs = require('fs');
var rewriteComponentSource = require('@ds/rewrite-component-source');
var glob = require('glob');
var unary = require('fn-unary');
var errto = require('errto');
var assign = require('lodash-node/modern/objects/assign');
var Promise = require('bluebird');

var readFile = Promise.promisify(require("fs").readFile);

exports.getParsedPartials = getParsedPartials;

function getParsedPartials(appRoot, viewPath) {
    var partialsRoot = path.join(appRoot, 'partials');
    var componentsRoot;
    var match = (viewPath || '').match(/\/@?ccc\/[^\/]+\/views\//);
    if (match) {
        componentsRoot =
            (viewPath.substring(0, match.index) + match[0])
            .replace(/\/views\/$/, '');
    }

    return new Promise(function (resolve, reject) {
        var gotFiles = errto(reject, function (files) {
            var partials = files.reduce(function (p, filename) {
                var filePath = path.join(partialsRoot,
                    filename);
                var partialName = filename.replace(htmlExtReg,
                    '').replace(/\/+/g, '.');
                p[partialName] = readFile(filePath, 'utf-8')
                    .then(function (content) {
                        return Ractive.parse(
                            rewriteComponentSource(
                                filePath, content), {
                                stripComments: false
                            });
                    });
                return p;
            }, {});
            resolve(componentsRoot ?
                getParsedPartials(componentsRoot).then(function (cp) {
                    return Promise.props(assign({}, partials, cp));
                }) :
                Promise.props(partials));
        });
        fs.exists(partialsRoot, function (exists) {
            if (!exists) {
                resolve({});
            } else {
                glob('**/*.html', {
                    cwd: partialsRoot
                }, gotFiles);
            }

        });

    });
}

exports.getParsedTemplate = getParsedTemplate;

function getParsedTemplate(filePath) {
    return readFile(filePath, 'utf-8')
        .then(function (template) {
            return Ractive.parse(rewriteComponentSource(filePath, template), {
                stripComments: false
            });
        });
}

exports.preRenderView = preRenderView;

function preRenderView(view) {
    if (!view.path) {
        return Promise.resolve({});
    }
    if (view.template && view.partials) {
        return Promise.resolve(view);
    }
    var appRoot = view.path.substring(0, Math.min(
        view.path.indexOf('/node_modules/@ccc/') + 1 || Infinity,
        view.path.indexOf('/ccc/') + 1 || Infinity,
        view.path.indexOf('/views/') + 1 || Infinity) - 1);
    return Promise.props({
        template: getParsedTemplate(view.path),
        partials: getParsedPartials(appRoot, view.path)
    })
        .then(assign.bind(null, view));
}

exports.renderView = renderView;

function renderView(view, options) {
    return preRenderView(view)
        .then(function (obj) {
            if (!view.path) {
                return Promise.resolve('');
            }
            return toHTML(view.template, view.partials, options);
        });
}

function toHTML(template, partials, options) {
    return (new Ractive({
        partials: partials,
        template: template,
        data: options
    })).toHTML();
}

exports.augmentApp = function (app, opts) {
    assert(opts.appRoot);
    app.set('view engine', 'html');
    app.engine('html', function (viewPath, options, fn) {
        renderView(getView(app, viewPath, getCache(app)), options)
            .then(function (html) {
                fn(null, html);
            }).catch(function (err) {
                fn(err);
            });
    });
    app.set('views', [].concat(app.get('views'))
        .concat((glob.sync('ccc/*/views/', {
                    cwd: opts.appRoot
                })
                .concat(glob.sync('node_modules/@ccc/*/views/', {
                    cwd: opts.appRoot
                })))
            .map(unary(path.join.bind(path, opts.appRoot))))
        .filter(Boolean));

    var View = app.get('view');

    function getViewPath(res) {
        return (res.viewPath || res.req.path).replace(/^\/|\/$/g, '');
    }

    function getCache(app) {
        return app.enabled('view cache') && app.cache || (app.cache = {});
    }

    function getView(app, viewPath, cache) {
        var view;
        if (cache && (view = cache[viewPath])) {
            return view;
        }
        view = new View(viewPath, {
            defaultEngine: app.get('view engine'),
            root: app.get('views'),
            engines: app.engines
        });
        if (cache && view.path) {
            cache[viewPath] = cache[view.path] = view;
        }
        return view;
    }

    app.response.preRenderView = function (name) {
        var res = this;
        if (!name) {
            name = getViewPath(res);
        }
        return preRenderView(getView(res.app, name, getCache(res.app)));
    };

    app.response.preRenderLocals = function (options) {
        var res = this;
        var app = res.app;
        options = options || {};

        var appLocals = {};
        if (app.locals.__proto__) { // import from parent-app, but not ancestor-app
            assign(appLocals, app.locals.__proto__);
        }
        assign(appLocals, app.locals);

        return Promise.props(assign(options, res.locals))
            .then(function (options) {
                return assign(appLocals, options);
            })
    };

    app.response.rendr = function (name, options) {
        var res = this;
        var app = res.app;
        if (!name) {
            name = getViewPath(res);
        } else if (typeof name !== 'string') {
            options = name;
            name = getViewPath(res);
        }
        options = options || {};

        return Promise.join(
            res.preRenderView(name),
            res.preRenderLocals(options),
            renderView);
    };

    app.response.render = function () {
        var res = this;
        var fn = arguments[arguments.length - 1];
        if (typeof fn !== 'function') {
            fn = errto(res.req.next, function (html) {
                res.send(html);
            });
        }
        res.rendr.apply(this, arguments)
            .then(fn.bind(null, null))
            .catch(fn);
    };

    var middleware = function (req, res, next) {
        var ext = path.extname(req.path);
        if (ext && ext !== '.html') {
            return next();
        }
        return res.rendr()
            .then(function (html) {
                res.send(html)
            })
            .catch(next);
    };

    if (opts.appendMiddleware) {
        app.use(middleware);
    }

    return middleware;
};
