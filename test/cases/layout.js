'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
require('ds-nrequire')
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.use('/global', require('ccc/global/routers/page'));
require('../../')(app);

tape('partial/a with layout', function (test) {
    test.plan(2);
    request(app)
        .get('/global/la')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!DOCTYPE html><!-- comments kept --><title>partial a</title><!DOCTYPE html> <span>partial a</span>');
        });
});

tape('partial/a with layout on /global/lb' , function (test) {
    test.plan(2);
    request(app)
        .get('/global/lb')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!DOCTYPE html><!-- hello from b --><!DOCTYPE html> <span>partial a</span>');
        });
});

tape('partial/a without layout on /global/lc' , function (test) {
    test.plan(2);
    request(app)
        .get('/global/lc')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), '<!DOCTYPE html> <span>partial a</span>');
        });
});
