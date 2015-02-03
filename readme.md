# `@ds/render`

## installation

```bash
ccnpm i --save @ds/render
```

## usage

```javascript
var dsRender = require('@ds/render');
var app = require('express')();
var dsRenderMiddleware = dsRender.augmentApp(app, {
    appRoot: __dirname // 必须的
    appendMiddleware: false // 默认 false, 设置成 true 会添加返回的 middleware： app.use(dsRenderMiddleware)
});
```

除了 `dsRender.augmentApp()` 方法返回一个供 express app 使用的 middleware 外，其他方法均返回 promise

### `dsRender.getParsedPartials(appRoot[, viewPath])`

把 `#{appRoot}/partials` 下的 `**/*.html` 文件做成 `Ractive.parse()` 后的模板对象，返回的 object promise resolve 后为类似：

```javascript
{
    a: {v:1,t:[/*...*/]}, // #{appRoot}/partials/a.html 解析后
    b.c.d: {v:1,t:[/*...*/]} //#{appRoot}/partials/b/c/d.html 解析后
}
```

如果把可选的 `viewPath` 给出如 `#{appRoot}/ccc/account/views/home.html` 则会到组件的根目录查找 partials，如存在 `#{appRoot}/ccc/account/partials/ac.html` 返回的对象会有 ac 这个 parsed partial，如果同时存在 `#{appRoot}/partials/ac.html` 和 `#{appRoot}/ccc/account/partials/ac.html`，以组件的 partial 为优先。

### `dsRender.getParsedTemplate(filePath)`

给出模板文件路径，返回 `Ractive.parse()` 后的模板对象（promise）。

以上两个方法是 `@ds/render` 的基础，返回的模板都会做资源路径的替换。

### dsRender.augmentApp(app, opts)

用法在最前面，使用后，express middleware 里面的 res 对象会添加下列方法：

#### res.preRenderView(name)
会先到 `#{componentRoot}/views` 再到 `#{appRoot}/views` 查找模板文件，返回的 view 对象（promise）中有 `view.template` 和 `view.partials`。

#### res.preRenderLocals(locals)
组合 `app.locals` (全局模板变量) `app.locals.__proto__` (父 app 的全局模板变量) res.locals 和这里给进的 locals，接受 promise，返回的是 promise

#### res.rendr(name, locals)
使用前面两个方法生成 html，返回的是 promise

#### res.render(name, locals, fn)
覆盖（overwrite）了 express 里面的 `res.render()` 方法。
