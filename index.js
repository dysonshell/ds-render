'use strict';
require('@ds/nrequire');
require('@ds/common');
var fs = require('fs');
var assert = require('assert');
var path = require('path');
var htmlExtReg = /\.html$/i;
var glob = require('glob');
var unary = require('fn-unary');
var co = require('co');
var errto = require('errto');

var readFile = Promise.promisify(require("fs").readFile);

function exists(filePath) {
    return new Promise(function (resolve) {
        fs.exists(filePath, resolve);
    });
}

exports.getParsedPartials = getParsedPartials;

function getParsedPartials(viewPath) {
    var match = (viewPath || '').match(/\/(ccc|node_modules\/@ccc)(\/[^\/]+\/)views\//);
    if (!match) {
        return Promise.reject(new Error('viewPath should be in ccc/*/views/ or node_modules/@ccc/*/views/'));
    }
    var cccPartialsRoot = viewPath.substring(0, match.index) + '/ccc' + match[2] + '/partials';
    var moduleCccPartialsRoot = viewPath.substring(0, match.index) + '/node_modules/@ccc' + match[2] + '/partials';

    return co(function * () {
        var files = [];
        if (yield exists(moduleCccPartialsRoot)) {
            files.concat(yield glob.bind(null, '**/*.html', {
                cwd: moduleCccPartialsRoot
            }));
        }
        if (yield exists(cccPartialsRoot)) {
            files.concat(yield glob.bind(null, '**/*.html', {
                cwd: cccPartialsRoot
            }));
        }
    });
    return Promise.props(files.reduce(function (p, filename) {
        var filePath = path.join(partialsRoot, filename);
        var partialName = filename.replace(htmlExtReg, '').replace(/\/+/g, '.');
        p[partialName] = readFile(filePath, 'utf-8') .then(function (content) {
            return Ractive.parse(content);
        });
        return p;
    }, {}));
}

exports.getParsedTemplate = getParsedTemplate;

function getParsedTemplate(filePath) {
    return readFile(filePath, 'utf-8')
        .then(function (template) {
            return Ractive.parse(template, {
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
    return Promise.props({
        template: getParsedTemplate(view.path),
        partials: getParsedPartials(view.path)
    }).then(_.assign.bind(null, view));
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
        })).concat(glob.sync('node_modules/@ccc/*/views/', {
            cwd: opts.appRoot
        }))
        .map(unary(path.join.bind(path, opts.appRoot))))
        .filter(Boolean));

    var View = app.get('view');

    function getViewPath(res) {
        var m = res.req.hookFactoryModule || res.req.routerFactoryModule;
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
            defaultEngine: 'html',
            root: [],
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
            _.assign(appLocals, app.locals.__proto__);
        }
        _.assign(appLocals, app.locals);

        return Promise.props(_.assign(options, res.locals))
            .then(function (options) {
                return _.assign(appLocals, options);
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
            fn = function (err, html) {
                res.req.next(err);
                res.send(html);
            };
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

    if (opts.appendMiddleware !== false) {
        app.use(middleware);
    }

    return middleware;
};
