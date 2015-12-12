'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
var app = require('../example');
require('../../')(app);

var request = require('supertest');

tape('partial/a', function (test) {
    test.plan(2);
    request(app)
        .get('/global/a')
        .expect(200)
        .end(function (err, res) {
            if (err) {
                console.error(err);
            }
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('partial/deep', function (test) {
    test.plan(2);
    request(app)
        .get('/global/deep')
        .expect(200)
        .end(function (err, res) {
            if (err) {
                console.error(err);
            }
            test.notOk(err);
            test.equal(res.text.trim(), 'deep partial partial in testc tc.d');
        });
});
