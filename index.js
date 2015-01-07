'use strict';
var Ractive = require('ractive');
var htmlExtReg = /\.html$/i;
var path = require('path');
var fs = require('fs');
var env = process.env.NODE_ENV || 'development';
var glob = require('glob');
var unary = require('fn-unary');
var errto = require('errto');
var async = require('async');
var rewrite = require('rev-rewriter');
var assign = require('lodash-node/modern/objects/assign');

exports.getPartials = getPartials;
exports.cRevPost = cRevPost;
exports.rewriteComponentSource = rewriteComponentSource;

function cRevPost(component) {
    component = component || '';
    return function (assetFilePath) {
        var prefix = component ? {
            '.js': '/js/',
            '.css': '/css/'
        }[path.extname(assetFilePath)] || '/img/' : '/assets/';
        return component + prefix + assetFilePath;
    };
}

function rewriteComponentSource(filePath, source) {
    var index, component;
    if ((index = filePath.indexOf('/ccc/')) > -1) {
        component = filePath.match(/\/ccc\/[^\/]+/)[0];
        source = rewrite({
            assetPathPrefix: '/js/',
            revPost: cRevPost(component)
        }, source);
        source = rewrite({
            assetPathPrefix: '/css/',
            revPost: cRevPost(component)
        }, source);
        source = rewrite({
            assetPathPrefix: '/img/',
            revPost: cRevPost(component)
        }, source);
        return source;
    }
    return source;
}

function getPartials(appRoot, files, cb) { //TODO: production 优化，cache
    var partialsRoot = path.join(appRoot, 'partials');
    if (typeof files === 'function') {
        cb = files;
        files = null;
    }

    var gotFiles = errto(cb, function (files) {
        async.reduce(files, {}, function (partials, filename, next) {
            var filePath = path.join(partialsRoot, filename);
            fs.readFile(filePath, 'utf-8', errto(next, function (
                content) {
                partials[filename.replace(htmlExtReg, '')
                    .replace(/\/+/g, '.')] =
                    rewriteComponentSource(filePath,
                        content);
                next(null, partials);
            }));
        }, cb);
    });

    if (files) {
        gotFiles(null, files);
    } else {
        fs.exists(partialsRoot, function (exists) {
            if (!exists) {
                cb(null, {});
            } else {
                glob('**/*.html', {
                    cwd: partialsRoot
                }, gotFiles);
            }

        });
    }

}

function replaceLibJs(html, options) {
    var settings = options.settings;
    var appRoot = (settings || {})
        .appRoot;

    if (appRoot && settings.assetsDirName) {
        var libs = [];
        try {
            libs = JSON.parse(fs.readFileSync(path.join(appRoot,
                settings.assetsDirName,
                'js',
                'lib.json'), 'utf-8'));
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
        libs = libs.map(function (lib) {
            return path.resolve(path.join(appRoot,
                'assets', 'js'), lib)
                .substring(appRoot.length);
        });
        var libJsReplaced;
        html = html.replace(
            /(<script\s+src=["']?)\/assets\/js\/lib.js(["']?><\/script>)/g,
            function (all, p1, p2) {
                if (libJsReplaced) {
                    return "";
                } else {
                    libJsReplaced = true;
                    return p1 + libs.join(p2 + p1) +
                        p2;
                }
            });
    }
    return html;
}
exports.engine = function (filePath, options, fn) {
    fs.readFile(filePath, 'utf-8', errto(fn, function (template) {
        template = rewrite({
            revPost: cRevPost('')
        }, template);
        template = rewriteComponentSource(filePath, template);
        var partials = options.partials;
        var match = filePath.match(/\/ccc\/[^\/]+\/views\//);
        if (match) {
            var componentsRoot = (filePath.substring(0, match.index) +
                match[0])
                .replace(/\/views\/$/, '');
            if (componentsRoot !== options.settings.subAppRoot) {
                getPartials(componentsRoot, errto(fn, function (
                    conponentsPartials) {
                    assign(partials, conponentsPartials);
                    render();
                }));
            } else {
                render();
            }
        } else {
            render();
        }

        function render() {
            var html = new Ractive({
                partials: partials,
                template: template, //TODO: production 优化，cache
                data: options
            })
                .toHTML();
            fn(null, replaceLibJs(html, options));
        }
    }));
};

function getReqPath(req) {
    return req.path.replace(/^\/|\/$/g, '');
}

exports.middleware = function () {
    return function (req, res, next) {
        var reqPath = getReqPath(req);
        if (res.viewPath) {
            reqPath = res.viewPath;
        }
        if (reqPath[0] === '/') {
            reqPath = reqPath.substring(1);
        }
        var ext = path.extname(reqPath);
        if (ext && ext !== '.html') {
            return next();
        }
        return res.render(reqPath);
    };
};

exports.argmentApp = function (app, opts) {
    app.set('view engine', 'html');
    app.engine('html', exports.engine);
    app.set('appRoot', opts.appRoot);
    app.set('assetsDirName', opts.assetsDirName);
    app.set('views', [].concat(app.get('views'))
        .concat(glob.sync('ccc/*/views/', {
                cwd: opts.appRoot
            })
            .map(unary(path.join.bind(path, opts.appRoot))))
        .filter(Boolean));
    app.use(function (req, res, next) {
        var _render = res.render;
        // 让 res.viewPath 支持 express-promise
        res.render = function (name, options, fn) {
            var res = this;
            var app = res.app;
            if (!name) {
                name = getReqPath(this.req);
            }
            if ('function' === typeof options) {
                fn = options;
                options = {};
            }
            options = options || {};
            var appLocals = {};
            if (app.locals.__proto__) { // support sub-app, but not sub-sub-app
                assign(appLocals, app.locals.__proto__);
            }
            assign(appLocals, app.locals);

            var opts = assign({}, appLocals, res.locals, options);
            var view;
            var cache = app.cache;
            // set .cache unless explicitly provided
            opts.cache = opts.cache ? app.enabled('view cache') :
                opts.cache;

            view = (opts.cache && cache[name]) || new(app.get('view'))(name, {
                defaultEngine: app.get('view engine'),
                root: app.get('views'),
                engines: app.engines
            });

            // default callback to respond
            fn = fn || function (err, str) {
                if (err) {
                    return res.req.next(err);
                }
                res[res.headersSent ? 'end' : 'send'](str);
            };

            if (!view.path) {
                return res.req.next();
            }

            var rushHeads = [].concat(app.locals.rushHeads)
                .concat(res.locals.rushHeads)
                .concat(options.rushHeads)
                .filter(Boolean);

            if (rushHeads.length) {
                res.statusCode = 200;
                res.set('Content-Type', 'text/html; charset=utf-8');

                res.write(rushHeads.join(''));
            }

            var partials;
            getPartials(app.set('appRoot'), errto(fn, function (
                appPartials) {
                if (res.app.set('subAppRoot')) {
                    getPartials(res.app.set('subAppRoot'),
                        errto(
                            fn, function (subAppPartials) {
                                partials = assign(appPartials,
                                    subAppPartials);
                                render();
                            }));
                } else {
                    partials = appPartials;
                    render();
                }
            }));

            function render() {
                if (res.locals.partials) {
                    assign(partials, res.locals.partials);
                }
                if (options.partials) {
                    assign(partials, options.partials);
                }
                opts.partials = partials;
                res.locals = {};
                _render.call(res, view.path, opts, fn);
            }

        };
        next();
    });
    if (opts.appendMiddleware !== false) {
        app.use(exports.middleware());
    }
};