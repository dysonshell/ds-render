'use strict';
require('@ds/common');
require('@ds/nrequire');
module.exports = function () {
    var app = require('express')();

    app.dsRenderMiddleware = require('../../')
        .augmentApp(app, {
            appendMiddleware: false,
            appRoot: __dirname,
            assetsDirName: 'assets',
            viewsDirName: 'views'
        });

    return app;
};
