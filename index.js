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

function getPartials(viewsRoot, absoluteViewPath) { //TODO: production 优化，cache
    var partialsRoot = path.join(viewsRoot, '_partials');
    if (!fs.existsSync(partialsRoot)) {
        return {};
    }
    var partialPairs = fs.readdirSync(partialsRoot)
        .filter(function (filename) {
            return filename.match(htmlExtReg) &&
                fs.statSync(path.join(partialsRoot, filename))
                .isFile();
        })
        .map(function (filename) {
            return [
                filename.replace(htmlExtReg, ''),
                fs.readFileSync(path.join(partialsRoot, filename), 'utf-8')
            ]; //TODO: production 优化，save parsed template
        });
    var partials = zipObject(partialPairs);
    var index, componentViewsRoot;
    if ((index = absoluteViewPath.indexOf('assets/components/')) > -1) {
        if ((index = absoluteViewPath.indexOf('/assets/')) > -1) {
            componentViewsRoot = absoluteViewPath.substring(0, index) +
                '/views';
            return assign(partials, getPartials(componentViewsRoot));
        }
    }
    return partials;
}

exports.engine = function (filePath, options, fn) {
    try {
        var template = fs.readFileSync(filePath, 'utf-8');
        var index, component;
        if ((index = filePath.indexOf('/components/')) > -1) {
            component = filePath.match(/\/components\/[^\/]+/)[0];
            template = rewrite({
                revPost: function (assetFilePath) {
                    if (assetFilePath === 'css/components.css') {
                        return '/assets/' + assetFilePath;
                    }
                    return component + '/assets/' + assetFilePath;
                }
            }, template);
        }
        var html = new Ractive({
            partials: options.partials,
            template: template, //TODO: production 优化，cache
            data: options
        })
            .toHTML();
        var appRoot = options._appRoot;
        var libs = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets', 'js',
            'lib.json'), 'utf-8'))
            .map(function (lib) {
                return path.resolve(path.join(appRoot,
                    'assets', 'js'), lib)
                    .substring(appRoot.length);
            });
        console.log(libs);
        html = html.replace(
            /(<script\s+src=["']?)\/assets\/js\/lib.js(["']?><\/script>)/,
            function (all, p1, p2) {
                return p1 + libs.join(p2 + p1) + p2;
            });
        fn(null, html);
    } catch (err) {
        fn(err);
    }
};

exports.middleware = function (viewsRoot) {
    var resolvedViewPath = {}; //TODO: refactory
    var appRoot = path.dirname(viewsRoot); //TODO: pass only appRoot
    return function (req, res, next) {
        var reqPath = req.path.replace(/\/$/, '');
        if (res.viewPath) {
            return render(res.viewPath);
        }
        var viewPath = path.join(viewsRoot, reqPath);
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
                            './components/*/views' + reqPath +
                            '.html',
                            function () {
                                findViewAndRender(
                                    './components/*/views' +
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
                cwd: appRoot
            }, function (error, files) {
                if (!files.length) {
                    return nf();
                }
                var absoluteViewPath = path.join(appRoot,
                    files[0]);
                res.locals.partials = getPartials(viewsRoot,
                    absoluteViewPath);
                render(absoluteViewPath);
            });
        }

        function render(rvp) {
            if (env === 'production' && viewPath in
                resolvedViewPath) {
                resolvedViewPath[viewPath] = rvp;
            }
            res.render(rvp, {
                _appRoot: appRoot
            });
        }
    };
};

exports.argmentApp = function (app, viewsRoot) {
    app.set('view engine', 'html');
    app.engine('html', exports.engine);
    app.use(exports.middleware(viewsRoot));
};