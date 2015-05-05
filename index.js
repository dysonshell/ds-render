'use strict';
require('@ds/nrequire');
require('@ds/common');
var fs = require('fs');
var assert = require('assert');
var path = require('path');
var glob = require('glob');
var cccglob = require('@ds/cccglob');
var unary = require('fn-unary');
var co = require('co');
var errto = require('errto');
var errs = require('errs');

var htmlExtReg = /\.html$/i;

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

var viewPathReg = /\/(ccc|node_modules\/@ccc)\/([^\/]+)\/views\//;

exports = module.exports = augmentApp;

exports.replaceMainContainer = replaceMainContainer;

function replaceMainContainer(lt, vt) {
    lt = JSON.parse(JSON.stringify(lt));

    function replace(node) {
        if (node.t === 7 && node.e === 'div' &&
            node.a && node.a.id === 'main-container') {
            node.f = vt.t;
            return true;
        }
    }

    function dfs(f) {
        for (var i = -1, node; node = f[++i];) {
            if (node.t !== 7) continue;
            if (replace(node)) return true;
            if (node.f && node.f.length && dfs(node.f)) return true;
        }
    }
    if (!dfs(lt.t)) {
        throw new Error('MAIN_CONTAINER_NOT_FOUND');
    }
    return lt;
}

exports.getParsedPartials = getParsedPartials;

function getParsedPartials(viewPath) {
    var match = (viewPath || '').match(viewPathReg);
    if (!match) {
        return Promise.reject(new Error('viewPath should be in either ccc/*/views/ or node_modules/@ccc/*/views/'));
    }

    var componentName = match[2];
    var prefix = 'ccc/' + componentName + '/partials/';
    return co(function * () {
        var files = (yield cccglob.bind(null, 'ccc/*/partials/**/*.html'));
            [].map(function(file) {
                return file.substring(prefix.length);
            });
        var p = {};
        files.forEach(function (filename) {
            var partialName = filename.replace(htmlExtReg, '');
            p[partialName] = Promise.resolve(require.resolve(filename))
                .then(readFile)
                .then(Ractive.parse);
            if (partialName.indexOf(prefix) === 0) {
                p[partialName.substring(prefix.length)] = p[partialName];
            }
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
        return Promise.reject(errs.create({
            message: 'VIEW_NOT_FOUND',
            statusCode: 404
        }));
    }
    if (view.template && view.partials) {
        return Promise.resolve(view);
    }
    return Promise.props({
        template: getParsedTemplate(view.path),
        partials: getParsedPartials(view.path)
    }).then(_.assign.bind(null, view));
}

var renderView = exports.renderView = co.wrap(function *(view, data) {
    view = yield preRenderView(view);
    data = yield Promise.props(yield Promise.resolve(data || {}));
    // data 可以整个是 promise，也可以其中某些属性是 promise
    return (new Ractive({
        partials: view.partials,
        template: view.template,
        data: data
    })).toHTML();
});

exports.augmentApp = augmentApp;
function augmentApp(app, opts) {
    opts = opts || {};
    var appRoot = app.set('root') || opts.appRoot;
    assert(appRoot);
    if (!GLOBAL.APP_ROOT) {
        GLOBAL.APP_ROOT = appRoot;
    }
    app.set('views', []);;

    var findPath = co.wrap(function *(prop, notFoundMessage, res) {
        var m = res.req.hookFactoryModule || res.req.routerFactoryModule;
        var vp = (res[prop] || res.req.path).replace(/^\/|\/$/g, '');
        var viewPath = vp.match(/\.html$/) ? vp : vp + '.html';
        if (viewPath.indexOf('ccc/') === 0) {
            return require.resolve(viewPath);
        }
        if (m) {
            return m.resolve('./views/' + viewPath);
        }
        var files = (yield cccglob.bind(null, 'ccc/*/views/' + viewPath))
            .map(require.resolve);
        if (files.length !== 1) {
            var errobj = {
                viewPath: '/' + vp,
                files: files,
            };
            if (m) {
                errobj.filename = m.filename;
            }
            if (files.length === 0) {
                errobj.message = notFoundMessage;
                errobj.statusCode = 404;
            } else if (files.length > 1) {
                errobj.message = 'FOUND_CONFLICTS';
            }
            throw errs.create(errobj);
        }
        return files[0];
    });

    var getViewPath = findPath.bind(null, 'viewPath', 'VIEW_NOT_FOUND');
    var getLayoutPath = findPath.bind(null, 'layout', 'LAYOUT_NOT_FOUND');

    function getView(viewPath) {
        var cache = app.enabled('view cache') ? (app.cache || (app.cache = {})) : false;
        if (cache && (view = cache[viewPath])) {
            return view;
        }
        var view = {
            path: viewPath
        };
        if (cache) {
            cache[viewPath] = cache[view.path] = view;
        }
        return preRenderView(view);
    }

    app.response.preRenderLocals = function (locals) {
        var res = this;
        var app = res.app;
        locals = locals || {};

        var appLocals = {};
        if (app.locals.__proto__) { // import from parent-app, but not ancestor-app
            _.assign(appLocals, app.locals.__proto__);
        }
        _.assign(appLocals, app.locals);

        return Promise.props(_.assign(locals, res.locals))
            .then(function (locals) {
                return _.assign(appLocals, locals);
            })
    };

    app.response.rendr = co.wrap(function *(vp, locals) {
        var res = this;
        if (typeof vp === 'string') {
            res.viewPath = vp;
        } else {
            locals = vp || {};
        }
        var viewPath = yield getViewPath(res);
        var view = yield getView(viewPath);
        var layoutPath;
        var layout;
        if (res.layout) {
            layoutPath = yield getLayoutPath(res);
            layout = yield getView(layoutPath);
            if (!app.enabled('view cache')) {
                view.template = replaceMainContainer(
                    layout.template, view.template
                );
            } else {
                var layoutWrapped = view.layoutWrapped || (view.layoutWrapped = {});
                if (layoutWrapped[layoutPath]) {
                    view = layoutWrapped[layoutPath];
                } else {
                    view = layoutWrapped[layoutPath] = xtend(view, {
                        template: replaceMainContainer(layoutView.template, view.template)
                    });
                }
            }
        }
        return renderView(view, res.preRenderLocals(locals));
    });

    app.response.render = function () {
        var res = this;
        var fn = arguments[arguments.length - 1];
        if (typeof fn !== 'function') {
            fn = function (err, html) {
                if (err) {
                    return res.req.next(err);
                }
                res.send(html);
            };
        }
        res.rendr.apply(this, arguments)
            .then(fn.bind(null, null))
            .catch(fn);
    };

    app.use(function (req, res, next) {
        var ext = path.extname(req.path);
        if (ext && ext !== '.html') {
            return next();
        }
        return res.render()
    });
    app.use(function (err, req, res, next) {
        if (err.message === 'FOUND_CONFLICTS') {
            // 这属于开发过程中的错误，强制显示提示开发者
            res.status(500);
            res.send('<!doctype html><h1>找到对应的多个模版</h1>' +
                '<p>自动解决模板路径在以下文件中找到多个对应的模版，请确保 url 与模版路径无冲突或在 router/hook 指定模版路径。</p>' +
                '<dl><dt>viewPath</dt><dd>'+ err.viewPath + '</dd>' +
                '<dt>files</dt><dd>'+ err.files.join('<br>') + '</dd></dl>');
            return;
        }
        next(err);
    });

    app.use(function (err, req, res, next) {
        // 处理所有接到的 err，要用 app.use 才行（否则只能接到同一 router 的 err）
        if (typeof err.statusCode === 'number') {
            res.status(err.statusCode);
        }
        if (typeof res.statusCode !== 'number' || res.statusCode < 400) {
            res.status(500);
        }
        res.viewPath = '' + res.statusCode;
        return getViewPath(res).then(function (viewPath) {
            // 重试显示自定义错误页面
            res.render();
        }).catch(function () {
            next(err);
        });
    });
}
