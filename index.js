'use strict';
var Ractive = require('ractive');
var htmlExtReg = /\.html$/i;
var path = require('path');
var fs = require('fs');
var zipObject = require('lodash-node/modern/arrays/zipObject');
var env = process.env.NODE_ENV || 'development';

exports.getPartials = getPartials;

function getPartials(viewsRoot) { //TODO: production 优化，cache
    var partialsRoot = path.join(viewsRoot, '_partials');
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
    return zipObject(partialPairs);
}

exports.engine = function (path, options, fn) {
    try {
        fn(null, new Ractive({
                partials: options.partials,
                template: fs.readFileSync(path, 'utf-8'), //TODO: production 优化，cache
                data: options
            })
            .toHTML());
    } catch (err) {
        fn(err);
    }
};

exports.middleware = function (viewsRoot) {
    var resolvedViewPath = {}; //TODO: refactory
    return function (req, res, next) {
        var reqPath = req.path.replace(/\/$/, '');
        if (res.viewPath) {
            return render(res.viewPath);
        }
        var viewPath = path.join(viewsRoot, reqPath);
        if (env === 'production' && viewPath in resolvedViewPath) {
            var rvp = resolvedViewPath[viewPath];
            if (false === rvp) {
                return notFound();
            } else {
                return render(rvp);
            }
        }
        findViewAndRender(viewPath + '.html', function () {
            findViewAndRender(viewPath + '/index.html', notFound);
        });

        function notFound() { //TODO: fix it
            resolvedViewPath[viewPath] = false;
            next();
        }

        function findViewAndRender(viewPath, nf) {
            fs.exists(viewPath, function (exists) {
                if (!exists) {
                    return nf();
                }
                res.locals.partials = getPartials(viewsRoot);
                render(viewPath);
            });
        }

        function render(rvp) {
            if (env === 'production' && viewPath in resolvedViewPath) {
                resolvedViewPath[viewPath] = rvp;
            }
            res.render(rvp);
        }
    };
};

exports.argmentApp = function (app, viewsRoot) {
    app.set('view engine', 'html');
    app.engine('html', exports.engine);
    app.use(exports.middleware(viewsRoot));
};