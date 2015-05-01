'use strict';
require('@ds/nrequire');
require('@ds/common');
var fs = require('fs');
var assert = require('assert');
var path = require('path');
var htmlExtReg = /\.html$/i;
var glob = require('glob');
var cccglob = require('@ds/cccglob');
var unary = require('fn-unary');
var co = require('co');
var errto = require('errto');
var errs = require('errs');

function readFile(filePath) {
    return new Promise(function (resolve, reject) {
        fs.readFile(filePath, 'utf8', function (err, content) {
            if (err) {
                return reject(err);
            }
            resolve(content);
        });
    });
}

function exists(filePath) {
    return new Promise(function (resolve) {
        fs.exists(filePath, resolve);
    });
}

exports.getParsedPartials = getParsedPartials;

function getParsedPartials(viewPath) {
    var match = (viewPath || '').match(/\/(ccc|node_modules\/@ccc)\/([^\/]+)\/views\//);
    if (!match) {
        return Promise.reject(new Error('viewPath should be in either ccc/*/views/ or node_modules/@ccc/*/views/'));
    }

    var componentName = match[2];
    var prefix = 'ccc/' + componentName + '/partials/';
    return co(function * () {
        var files = (yield cccglob.bind(null, prefix + '**/*.html'))
            .map(function(file) {
                return file.substring(prefix.length);
            });
        var p = {};
        files.forEach(function (filename) {
            var partialName = filename.replace(htmlExtReg, '').replace(/\/+/g, '__');
            p[partialName] = co(function *() {
                var filePath = path.join(APP_ROOT, prefix, filename);
                if (!(yield exists(filePath))) {
                    filePath = path.join(APP_ROOT, 'node_modules/@' + prefix, filename);
                }
                return filePath;
            }).then(readFile).then(Ractive.parse);
        });
        return Promise.props(p);
    });
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
        return Promise.reject(new Error('VIEW_NOT_FOUND'));
    }
    if (view.template && view.partials) {
        return Promise.resolve(view);
    }
    return Promise.props({
        template: getParsedTemplate(view.path),
        partials: getParsedPartials(view.path)
    }).then(_.assign.bind(null, view));
}

exports.renderView = co.wrap(function *(view, data) {
    view = yield preRenderView(view);
    data = yield Promise.props(yield Promise.resolve(data || {}));
    // data 可以整个是 promise，也可以其中某些属性是 promise
    return (new Ractive({
        partials: view.partials,
        template: view.template,
        data: data
    })).toHTML();
});

exports.augmentApp = function (app, opts) {
    assert(opts.appRoot);
    if (!GLOBAL.APP_ROOT) {
        GLOBAL.APP_ROOT = opts.appRoot;
    }
    app.set('view engine', 'html');
    app.engine('html', function (viewPath, options, fn) {
        renderView(getView(app, viewPath, getCache(app)), options)
            .then(function (html) {
                fn(null, html);
            }).catch(function (err) {
                fn(err);
            });
    });
    app.set('views', []);;

    var View = app.get('view');

    var getViewPath = co.wrap(function *(res) {
        var m = res.req.hookFactoryModule || res.req.routerFactoryModule;
        var viewPath = (res.viewPath || res.req.path).replace(/^\/|\/$/g, '');
        if (viewPath.indexOf('ccc/') === 0) {
            return require.resolve(viewPath);
        }
        if (m) {
            return m.resolve('./views/' + viewPath);
        }
        var files = yield cccglob.bind(null, 'ccc/*/views/' + viewPath);
        if (files.length !== 1) {
            var errobj = {
                viewPath: viewPath,
                files: files,
            };
            if (m) {
                errobj.filename = m.filename;
            }
            if (files.length === 0) {
                errobj.message = 'NOT_FOUND';
            } else if (files.length > 1) {
                errobj.message = 'FOUND_CONFLICTS';
            }
            throw errs.create(errobj);
        }
        return files[0];
    });

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

    app.response.preRenderView = co.wrap(function *(name) {
        var res = this;
        if (!name) {
            name = yield getViewPath(res);
        }
        return preRenderView(getView(res.app, name, getCache(res.app)));
    });

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

    app.response.rendr = co.wrap(function *(name, options) {
        var res = this;
        var app = res.app;
        if (!name) {
            name = yield getViewPath(res);
        } else if (typeof name !== 'string') {
            options = name;
            name = yield getViewPath(res);
        }
        options = options || {};

        return Promise.join(
            res.preRenderView(name),
            res.preRenderLocals(options),
            renderView);
    });

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
            .catch(function(err) {
                if (err.message === 'NOT_FOUND') {
                    fn(null, '<!doctype html><h1>未找到模版</h1><dl>' +
                        '<dt>viewPath</dt><dd>'+ err.viewPath + '</dd>' +
                        (err.filename ? '<dt>filename</dt><dd>'+ err.filename + '</dd>' : '') +
                        '</dl>');
                } else if (err.message === 'FOUND_CONFLICTS') {
                    fn(null, '<!doctype html><h1>找到对应的多个模版</h1>' +
                        '<p>自动解决模板路径在以下文件中找到多个对应的模版，请确保 url 与模版路径无冲突或在 router/hook 指定模版路径。</p>' +
                        '<dl><dt>viewPath</dt><dd>'+ err.viewPath + '</dd>' +
                        '<dt>files</dt><dd>'+ err.files.join('<br>') + '</dd></dl>');
                } else {
                    fn(err);
                }
            });
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
