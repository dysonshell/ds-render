'use strict';
var express = require('express');
var router = express.Router();

router.get('/a', function (req, res) {
    req.routerFactoryModule = module;
    res.render();
});
router.get('/b', function (req, res) {
    req.routerFactoryModule = module;
    res.render('a');
});
router.get('/c', function (req, res) {
    req.routerFactoryModule = module;
    res.render({
        dsViewPath: 'a',
    });
});
module.exports = router;
