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

function getPartials(appRoot, absoluteViewPath) { //TODO: production 优化，cache
    var partialsRoot = path.join(appRoot, 'partials');
    if (!fs.existsSync(partialsRoot)) {
        return addComponentPartials({});
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

    return addComponentPartials(zipObject(partialPairs));

    function addComponentPartials(globalPartials) {
        var index, componentRoot;
        if (absoluteViewPath &&
            (index = absoluteViewPath.indexOf('/ccc/')) > -1) {
            if ((index = absoluteViewPath.indexOf('/views/')) > -1) {
                componentRoot = absoluteViewPath.substring(0, index);
                return assign(globalPartials, getPartials(componentRoot));
            }
        } else {
            return globalPartials;
        }
    }
}


exports.engine = function (filePath, options, fn) {
    try {
        var template = fs.readFileSync(filePath, 'utf-8');
        template = rewrite({
            revPost: cRevPost('')
        }, template);
        template = rewriteComponentSource(filePath, template);
        var html = new Ractive({
            partials: options.partials,
            template: template, //TODO: production 优化，cache
            data: options
        })
            .toHTML();
        var appRoot = options.appRoot;
        if (appRoot && options.assetsDirName) {
            var libs = [];
            try {
                libs = JSON.parse(fs.readFileSync(path.join(appRoot,
                    options.assetsDirName,
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
        fn(null, html);
    } catch (err) {
        fn(err);
    }
};

exports.middleware = function (opts) {
    var resolvedViewPath = {}; //TODO: refactory
    return function (req, res, next) {
        var reqPath = req.path.replace(/\/$/, '');
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
    app.locals.appRoot = opts.appRoot;
    app.locals.assetsDirName = opts.assetsDirName;
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
            if ('function' === typeof options) {
                fn = options;
                options = {};
            }
            this.locals.partials = this.locals.partials || getPartials(opts
                .appRoot);
            options = assign({}, app.locals, this.locals, options);
            this.locals = {};
            _render.call(this, view, options, fn);
        };
        next();
    });
    app.use(exports.middleware(opts));
};