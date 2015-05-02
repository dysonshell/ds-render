'use strict';
require('@ds/nrequire');
require('@ds/common');
var fs = require('fs');
var assert = require('assert');
var path = require('path');
var express = require('express');
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

exports.getParsedPartials = getParsedPartials;

function getParsedPartials(viewPath) {
    console.log('gpp', viewPath);
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
        console.log('files', files);
        files.forEach(function (filename) {
            var partialName = filename.replace(htmlExtReg, '');
            p[partialName] = Promise.resolve(require.resolve(filename))
                .then(readFile)
                .then(Ractive.parse);
            if (partialName.indexOf(prefix) === 0) {
                p[partialName.substring(prefix.length)] = p[partialName];
            }
        });
        console.log('p', p);
        return Promise.props(p);
    });
}

exports.getParsedTemplate = getParsedTemplate;

function getParsedTemplate(filePath) {
console.log('gpt', filePath);
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

exports.augmentApp = function (app, opts) {
    assert(opts.appRoot);
    if (!GLOBAL.APP_ROOT) {
        GLOBAL.APP_ROOT = opts.appRoot;
    }
    app.set('views', []);;

    var getViewPath = co.wrap(function *(res) {
        var m = res.req.hookFactoryModule || res.req.routerFactoryModule;
        var vp = (res.viewPath || res.req.path).replace(/^\/|\/$/g, '');
        var viewPath = vp.match(/\.html$/) ? vp : vp + '.html';
        if (viewPath.indexOf('ccc/') === 0) {
            return require.resolve(viewPath);
        }
        if (m) {
            return m.resolve('./views/' + viewPath);
        }
        var files = (yield cccglob.bind(null, 'ccc/*/views/' + viewPath))
            .map(require.resolve);
        console.log('files', files);
        console.log('files.length', files.length);
        if (files.length !== 1) {
            var errobj = {
                viewPath: '/' + vp,
                files: files,
            };
            if (m) {
                errobj.filename = m.filename;
            }
            if (files.length === 0) {
                errobj.message = 'VIEW_NOT_FOUND';
            } else if (files.length > 1) {
                errobj.message = 'FOUND_CONFLICTS';
            }
            throw errs.create(errobj);
        }
        return files[0];
    });

    function getView(viewPath) {
        var cache = app.enabled('view cache') ? (app.cache || (app.cache = {})) : false;
        if (cache && (view = cache[viewPath])) {
            return view;
        }
        console.log('getView', viewPath);
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

    app.response.rendr = co.wrap(function *(viewPath, locals) {
        var res = this;
        var app = res.app;
        if (!viewPath) {
            viewPath = yield getViewPath(res);
        } else if (typeof viewPath !== 'string') {
            locals = viewPath;
            viewPath = yield getViewPath(res);
        }
        if (!viewPath.match(viewPathReg)) {
            res.viewPath = viewPath;
            viewPath = yield getViewPath(res);
        }
        locals = locals || {};

        console.log('rendr viewPath', viewPath);
        var args = yield [getView(viewPath), res.preRenderLocals(locals)];
        console.log(args);

        return renderView.apply(null, args);
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

    var router = express.Router();
    router.use(function (req, res, next) {
        var ext = path.extname(req.path);
        if (ext && ext !== '.html') {
            return next();
        }
        return res.render()
    });
    router.use(function (err, req, res, next) {
        res.status(500);
        if (err.message === 'VIEW_NOT_FOUND') {
            res.send('<!doctype html><h1>未找到模版</h1><dl>' +
                '<dt>viewPath</dt><dd>'+ err.viewPath + '</dd>' +
                (err.filename ? '<dt>filename</dt><dd>'+ err.filename + '</dd>' : '') +
                '</dl>');
        } else if (err.message === 'FOUND_CONFLICTS') {
            res.send('<!doctype html><h1>找到对应的多个模版</h1>' +
                '<p>自动解决模板路径在以下文件中找到多个对应的模版，请确保 url 与模版路径无冲突或在 router/hook 指定模版路径。</p>' +
                '<dl><dt>viewPath</dt><dd>'+ err.viewPath + '</dd>' +
                '<dt>files</dt><dd>'+ err.files.join('<br>') + '</dd></dl>');
        } else {
            next(err);
        }
    });

    if (opts.appendMiddleware !== false) {
        app.use(router);
    }

    return router;
};
