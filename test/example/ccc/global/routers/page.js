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

router.get('/la', function (req, res) {
    req.routerFactoryModule = module;
    console.log(111);
    res.locals.dsLayoutPath = 'layouts/default';
    res.render();
});
router.get('/lb', function (req, res) {
    req.routerFactoryModule = module;
    res.locals.dsLayoutPath = 'ccc/global/views/layouts/b';
    res.render('la');
});
router.get('/lc', function (req, res) {
    req.routerFactoryModule = module;
    res.locals.dsLayoutPath = false;
    res.render('la');
});

module.exports = router;
