'use strict';
var Ractive = require('ractive');
var htmlExtReg = /\.html$/i;
var path = require('path');
var fs = require('fs');
var zipObject = require('lodash-node/modern/arrays/zipObject');
var env = process.env.NODE_ENV || 'development';
var glob = require('glob');
var unary = require('fn-unary');
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

function getPartials(appRoot) { //TODO: production 优化，cache
    var partialsRoot = path.join(appRoot, 'partials');
    if (!fs.existsSync(partialsRoot)) {
        return {};
    }
    var partialPairs = glob.sync('**/*.html', {
        cwd: partialsRoot
    })
        .filter(function (filename) {
            return filename.match(htmlExtReg) &&
                fs.statSync(path.join(partialsRoot, filename))
                .isFile();
        })
        .map(function (filename) {
            var filePath = path.join(partialsRoot, filename);
            var template = rewriteComponentSource(filePath, fs.readFileSync(
                filePath, 'utf-8'));

            return [
                filename.replace(htmlExtReg, '')
                .replace(/\/+/g, '.'),
                template
            ]; //TODO: production 优化，save parsed template
        });

    return zipObject(partialPairs);
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
    try {
        var template = fs.readFileSync(filePath, 'utf-8');
        template = rewrite({
            revPost: cRevPost('')
        }, template);
        template = rewriteComponentSource(filePath, template);
        var partials = options.partials;
        var match = filePath.match(/\/ccc\/[^\/]+\/views\//);
        if (match) {
            var componentRoot = (filePath.substring(0, match.index) + match[0])
                .replace(/\/views\/$/, '');
            if (componentRoot !== options.settings.subAppRoot) {
                assign(partials, getPartials(componentRoot));
            }
        }
        var html = new Ractive({
            partials: partials,
            template: template, //TODO: production 优化，cache
            data: options
        })
            .toHTML();
        fn(null, replaceLibJs(html, options));
    } catch (err) {
        fn(err);
    }
};

function getReqPath(req) {
    return req.path.replace(/^\/|\/$/g, '');
}

exports.middleware = function () {
    return function (req, res) {
        var reqPath = getReqPath(req);
        if (res.viewPath) {
            reqPath = res.viewPath;
        }
        if (reqPath[0] === '/') {
            reqPath = reqPath.substring(1);
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
        res.render = function (view, options, fn) {
            if (!view) {
                view = getReqPath(this.req);
            }
            if ('function' === typeof options) {
                fn = options;
                options = {};
            }
            options = options || {};
            var appLocals = {};
            if (this.app.locals.__proto__) { // support sub-app, but not sub-sub-app
                assign(appLocals, this.app.locals.__proto__);
            }
            assign(appLocals, this.app.locals);

            var partials = {};
            assign(partials, getPartials(this.app.set('appRoot')));
            if (this.app.set('subAppRoot')) {
                assign(partials, getPartials(this.app.set('subAppRoot')));
            }
            if (this.locals.partials) {
                assign(partials, this.locals.partials);
            }
            if (options.partials) {
                assign(partials, options.partials);
            }

            options = assign({}, appLocals, this.locals, options, {
                partials: partials
            });
            this.locals = {};
            _render.call(this, view, options, fn);
        };
        next();
    });
    if (opts.appendMiddleware !== false) {
        app.use(exports.middleware());
    }
};