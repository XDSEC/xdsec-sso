# 贡献

欢迎参与 `xdsec-sso` 的开发与维护。

本文档将提供一些开发说明与要求，请务必阅读。

## 提交说明

- 使用 [gitmoji](https://gitmoji.dev) 格式编写 commit 消息。  
    格式样例：`:memo: update CONTRIBUTING.md`  
    :memo: update CONTRIBUTING.md
- commit 首行消息采用英文，首字母不大写。
- commit 消息的第一行要保持简洁，描述主要修改行为而非罗列所有文件。
- 如有必要，详细的说明应从第二行写起。
- 回退版本请优先使用 `git revert`。

> [!IMPORTANT]
> 请使用 Markdown 的 emoji 代码格式，而非一个 emoji 表情符号。  
> 例如：使用 `:sparkles:` 而非 `✨`

## 分支管理

主要分支：

- **main**：已经过测试，可以直接用于生产环境的版本。
- **develop**：处于开发阶段的代码。

只有以下情况允许申请合并至 **main**：

- develop 分支测试完毕，准备上线生产环境。
- 仅修改了文档等内容，未修改代码。
- 紧急安全修复。
- 其他特殊情况......

**一般情况下，请优先申请合并到 develop 分支。**

## 部署测试

请参阅 [deploy/README.md](./deploy/README.md)。

## 后端开发

### 代码风格

对于 Rust 代码，请遵循 [rustfmt.toml](./rustfmt.toml) 中的规定。

当你需要格式化代码时，使用 `cargo +nightly fmt`。

请使用中文注释，遵守 [rustdoc 规范](https://rustwiki.org/zh-CN/rustdoc/how-to-write-documentation.html)。

## 前端开发

空空如也......