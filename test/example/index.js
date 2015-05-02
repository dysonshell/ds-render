'use strict';
require('@ds/common');
Ractive.DEBUG = false;
console.log(APP_ROOT);
require('@ds/nrequire');
exports = module.exports = function () {
    var app = require('express')();

    app.dsRenderMiddleware = require('../../')
        .augmentApp(app, {
            appendMiddleware: false,
            appRoot: __dirname,
        });

    return app;
};
if (require.main === module) {
    var app = exports();
    app.use(app.dsRenderMiddleware);
    app.listen(8000, function (err) {
        if (err) return console.log(err);
        console.log('listening', this.address().port);
    });
}
