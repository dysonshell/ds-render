'use strict';
var path = require('path');
var fs = require('fs');
var assert = require('assert');
require('ds-require');
var config = require('config');
var resolveFilename = require('module')._resolveFilename;
var glob = require('glob');
var unary = require('fn-unary');
var errto = require('errto');
var errs = require('errs');
var xtend = require('xtend');
var Ractive = require('ractive');
var Promise = require('bluebird');
var resolveDeepProps = require('bluebird-deep-props');
var _ = require('lodash');

// config
var APP_ROOT = config.dsAppRoot;
var DSC = config.dsComponentPrefix || 'dsc';
var DSCns = DSC.replace(/^\/+/, '').replace(/\/+$/, '');
DSC = DSCns + '/';

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

var viewPathReg = new RegExp('\\\/('+DSCns+'|node_modules\\\/@'+DSCns+')\\\/([^\\\/]+)\\\/views\\\/');
var componentPathReg = new RegExp('\\\/('+DSCns+'|node_modules\\\/@'+DSCns+')\\\/([^\\\/]+)\\\/');

exports = module.exports = augmentApp;

exports.getComponentName = getComponentName;
function getComponentName(viewPath, isView) {
    var match = (viewPath || '').match(isView ? viewPathReg : componentPathReg);
    if (!match) {
        return Promise.reject(new Error('dsViewPath should be in either ${DSC}/*/views/ or node_modules/@${DSC}/*/views/'));
    }
    return match[2];
}

exports.getParsedPartials = getParsedPartials;

var globAsync = Promise.promisify(glob);

function getParsedPartials(viewPath) {
    var componentName = getComponentName(viewPath, true);
    var prefix = DSC + componentName + '/partials/';
    return Promise.coroutine(function * () {
        var files = yield globAsync(DSC + '*/partials/**/*.html', {cwd: APP_ROOT});
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
    })();
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

function preRenderView(cache, view) {
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
    }).then(function (obj) {
        _.assign(view, obj);
        view.component = Ractive.extend({
            template: view.template,
            partials: view.partials,
        });
        return Promise.resolve(view);
    });
}

function getRactive(cache, view, layout) {
    var ractive;
    var cacheKey = view.path + '|' + (layout && layout.path ? layout.path : '');

    if (cache && (ractive = cache[cacheKey])) {
        return ractive;
    }

    if (layout) {
        ractive = new Ractive({
            partials: view.partials,
            template: view.template,
            components: {
                dsBody: layout.component,
            },
        });
    } else {
        ractive = new Ractive({
            partials: view.partials,
            template: view.template,
        });
    }

    if (cache) {
        cache[cacheKey] = ractive;
    }

    return ractive;
}

var getView = exports.getView = Promise.coroutine(function *(cache, viewPath) {
    if (cache && (view = cache[viewPath])) {
        return view;
    }
    var view = {
        path: viewPath
    };
    view = yield preRenderView(cache, view);
    if (cache) {
        cache[viewPath] = view;
    }
    return view;
});


var renderView = exports.renderView = Promise.coroutine(function *(cache, view, layout, data) {
    view = yield preRenderView(cache, view);
    if (data.state &&
            typeof data.state.toString === 'function' &&
            data.state.toString.toString().indexOf('[native code]' === -1)) {
        data.state = data.state.toString(); // for express-state
    }
    data = yield resolveDeepProps(data || {});
    // data 可以整个是 promise，也可以其中某些属性是 promise
    var ractive = getRactive(cache, view, layout);
    ractive.viewmodel.reset(data);
    ractive.update();
    var html = ractive.toHTML();
    if (!cache) {
        yield ractive.teardown();
    }
    return html;
});

exports.augmentApp = augmentApp;
function augmentApp(app) {
    app.set('views', []);

    var findPath = Promise.coroutine(function *(notFoundMessage, res, viewPath) {
        var m = res.req.routerFactoryModule;
        // e.g. "/app/web/dsc/account/routes/page.js"
        viewPath = (viewPath || '').replace(/^\/+|\.html$|\/+$/g, '');
        var errobj = {
            viewPath: viewPath,
        };
        var result, parts, componentName;
        try {
            if (viewPath.indexOf(DSC) === 0) {
                result = require.resolve(viewPath + '.html');
            } else if (!m && !viewPath) { // should render index
                result = require.resolve(DSC + 'index/views/index.html');
            } else if (m) {
                componentName = getComponentName(m.filename)
                result = resolveFilename(DSC + componentName + '/views/' + viewPath + '.html', m);
            } else { // no router, find by first part of req.path
                parts = viewPath.split('/');
                parts.splice(1, 0, 'views');
                result = require.resolve(DSC + parts.join('/') + '.html');
            }
        } catch(e) {
            if (e.code === 'MODULE_NOT_FOUND') {
                errobj.message = notFoundMessage;
                errobj.statusCode = 404;
                throw errs.create(errobj);
            } else {
                throw e;
            }
        }
        return result;
    });

    var tryViewPath = findPath.bind(null, 'VIEW_NOT_FOUND');
    var findViewPath = Promise.coroutine(function *(res, locals) {
        var viewPath = yield res.preRenderViewPath(locals);
        var oe;
        return tryViewPath(res, viewPath)
            .catch(function (e) {
                if (e.message !== 'VIEW_NOT_FOUND') {
                    throw e;
                }
                oe = e;
                return tryViewPath(res, viewPath + '/index');
            })
            .catch(function (e) {
                throw oe || e;
            });
    });
    var findLayoutPath = findPath.bind(null, 'LAYOUT_NOT_FOUND');

    app.response.preRenderViewPath = function (locals) {
        var res = this;
        var app = res.app;
        var req = res.req;
        locals = locals || {};

        return Promise.resolve(
            locals.dsViewPath ||
            res.locals.dsViewPath ||
            app.locals.dsViewPath ||
            req.path.replace(/^\/|\/$/g, ''));
    };

    app.response.mergeLocals = function (locals) {
        var res = this;
        var app = res.app;
        locals = locals || {};

        return _.assign({}, app.locals, res.locals, locals);
    };

    app.response.rendr = Promise.coroutine(function *(vp, locals) {
        var cache = app.enabled('view cache') ? (app.cache || (app.cache = {})) : false;
        var res = this;
        if (typeof vp === 'string') {
            locals = locals || {};
            locals.dsViewPath = vp;
        } else {
            locals = vp || {};
        }
        var viewPath = yield findViewPath(res, locals);
        var view = yield getView(cache, viewPath);
        var vt = view.template.t;
        var dsLayoutPath, layoutPath, layout;
        var fe = vt[0];
        if (fe && fe.t === 7 && fe.e === 'dsBody' && fe.a && fe.a.layout) {
            if (typeof fe.a.layout === 'string') {
                dsLayoutPath = yield Promise.resolve(fe.a.layout);
            } else if (fe.a.layout.length === 1 && fe.a.layout[0].t === 2 && typeof fe.a.layout[0].r === 'string') {
                dsLayoutPath = yield Promise.resolve(locals[fe.a.layout[0].r] ||
                    res.locals[fe.a.layout[0].r] ||
                    app.locals[fe.a.layout[0].r]);
            }
            if (dsLayoutPath) {
                layoutPath = yield findLayoutPath(res, dsLayoutPath);
                layout = yield getView(cache, layoutPath);
            } else {
                fe = vt.shift();
                vt.splice.apply(vt, [0, 0].concat(fe.f || []));
            }
        }
        locals.dsViewPathResolved = path.relative(APP_ROOT, view.path).replace(/^node_modules\/@|\.html$/g, '');
        if (typeof res.expose === 'function') {
            res.expose(locals.dsViewPathResolved, 'dsViewPathResolved');
        }
        return renderView(cache, view, layout, res.mergeLocals(locals));
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
        // 处理所有接到的 err，要用 app.use 才行（否则只能接到同一 router 的 err）
        if (typeof err.statusCode === 'number') {
            res.statusCode = err.statusCode;
        }
        if (typeof res.statusCode !== 'number' || res.statusCode < 400) {
            res.statusCode = 500;
        }
        res.locals.dsViewPath = DSC + 'errors/views/' + res.statusCode;
        err.message = '! on url: ' + req.originalUrl.replace(/\?.*$/, '') + ' - ' + err.message;
        console[err.statusCode >= 500 ? 'error' : 'info'](err.message.match(/_NOT_FOUND$/) ? err.message : err.stack);
        return findViewPath(res).then(function (viewPath) {
            // 重试显示自定义错误页面
            res.render();
            return null;
        }).catch(next.bind(null, err));
    });
}
