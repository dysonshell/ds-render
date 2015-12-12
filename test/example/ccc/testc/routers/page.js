'use strict';
var express = require('express');
var router = express.Router();

router.get('/d', function (req, res) {
    req.routerFactoryModule = module;
    res.locals.dsViewPath = 'c';
    res.render();
});

router.get('/cc', function (req, res, next) {
    req.routerFactoryModule = module;
    res.locals.dsViewPath = 'ccc/testc/views/c';
    next();
});
module.exports = router;
