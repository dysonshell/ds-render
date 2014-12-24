'use strict';
var Ractive = require('ractive');
var htmlExtReg = /\.html$/i;
var path = require('path');
var fs = require('fs');
var zipObject = require('lodash-node/modern/arrays/zipObject');
var env = process.env.NODE_ENV || 'development';
var glob = require('glob');
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

    // support nested partials
    // such as 
    //     /ccc/account/partials/settings/bankcard.html
    //                                   /agreement.html
    // 引用 {{>settings.bankcard}}
    var obj = getPartialsObj(partialsRoot); // global partials
    return addComponentPartials(obj);

    function addComponentPartials(globalPartials) {
        var index, componentRoot;
        if (absoluteViewPath &&
            (index = absoluteViewPath.indexOf('/ccc/')) > -1) {
            if ((index = absoluteViewPath.indexOf('/views/')) > -1) {
                componentRoot = absoluteViewPath.substring(0, index);

                var componentPartialsObj = getPartialsObj(path.join(
                    componentRoot, "partials")); // 子component的partials
                return assign(globalPartials, componentPartialsObj);
            }
        } else {
            return globalPartials;
        }
    }
}

// 根据一个目录,返回对应的obj
// 扁平结构
function getPartialsObj(root) {
    var ret = {};
    processDir(root);
    return ret;

    function processDir(dir, keypath) {
        keypath = keypath || []; // default []

        fs.readdirSync(dir)
            .forEach(function (entry) {
                var entryPath = path.join(dir, entry);
                var s = fs.statSync(entryPath);

                if (s.isDirectory()) { // dir
                    processDir(entryPath, keypath.concat(entry));
                } else if (s.isFile() && entry.match(htmlExtReg)) { // file
                    // key
                    var entryWithNoExt = entry.replace(htmlExtReg, '');
                    var key = keypath.concat(entryWithNoExt)
                        .join(".");

                    // value
                    var template = rewriteComponentSource(entryPath, fs.readFileSync(
                        entryPath, 'utf-8'));

                    ret[key] = template;
                }
            });
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
            var libs = JSON.parse(fs.readFileSync(path.join(appRoot,
                options.assetsDirName,
                'js',
                'lib.json'), 'utf-8'))
                .map(function (lib) {
                    return path.resolve(path.join(appRoot,
                        'assets', 'js'), lib)
                        .substring(appRoot.length);
                });
            var libJsReplaced;
            html = html.replace(
                /(<script\s+src=["']?)\/assets\/js\/lib.js(["']?><\/script>)/g,
                function (all, p1, p2) {
                    return libJsReplaced ? '' : p1 + libs.join(p2 + p1) +
                        p2;
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
            return render(path.join(opts.appRoot, opts.viewsDirName, res.viewPath));
        }
        var viewPath = path.join(opts.appRoot, opts.viewsDirName, reqPath);
        if (env === 'production' && viewPath in
            resolvedViewPath) {
            var rvp = resolvedViewPath[viewPath];
            if (false === rvp) {
                return notFound();
            } else {
                return render(rvp);
            }
        }
        findViewAndRender('./views' + reqPath + '.html',
            function () {
                findViewAndRender('./views' + reqPath +
                    '/index.html', function () {
                        findViewAndRender(
                            './ccc/*/views' + reqPath +
                            '.html',
                            function () {
                                findViewAndRender(
                                    './ccc/*/views' +
                                    reqPath + '/index.html',
                                    notFound);
                            });
                    });
            });

        function notFound() { //TODO: fix it
            resolvedViewPath[viewPath] = false;
            next();
        }

        function findViewAndRender(viewPath, nf) {
            glob(viewPath, {
                cwd: opts.appRoot
            }, function (error, files) {
                if (!files.length) {
                    return nf();
                }
                var absoluteViewPath = path.join(opts.appRoot,
                    files[0]);

                res.locals.partials = getPartials(opts.appRoot,
                    absoluteViewPath);

                render(absoluteViewPath);
            });
        }

        function render(rvp) {
            if (env === 'production' && viewPath in
                resolvedViewPath) {
                resolvedViewPath[viewPath] = rvp;
            }
            res.render(rvp);
        }
    };
};

exports.argmentApp = function (app, opts) {
    app.set('view engine', 'html');
    app.engine('html', exports.engine);
    app.locals.appRoot = opts.appRoot;
    app.locals.assetsDirName = opts.assetsDirName;
    app.use(function (req, res, next) {
        var _render = res.render;
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