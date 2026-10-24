# 策略所属回测列表 QA

final result: passed

结论仅覆盖独立候选的策略回测列表、相关入口和导航；当前运行前端尚未切换。2026-10-24 在 Air Chrome 对真实本机后端完成验收，没有使用假数据行。

## 参考和比较方法

只读查看用户目录 `/Users/yinming/Downloads/screenshot_tmp` 的两张原始2048×1189图片：`ChatGPT 图像 2026年10月24日 12_55_17.png` 是聚宽策略所属回测列表，`12_55_25.png` 是原QuantWeb失败结果页。原图未修改。

排除浏览器顶栏50px和左栏60px后，内容区为1988×1139；使用未改动QuantWeb的50px全站导航校准，归一化到实际Chrome1864×1068视口。副本仅用于对照。按product-design:image-to-code及design-qa流程，把源图和真实实现同时放入一张全图及一张对应区域图检查，修正后重新拍摄、重新组合检查。

证据目录：`/Users/yinming/Documents/Codex/2026-10-24/task-4/evidence/`。

- `joinquant-reference.png`：归一化参考。
- `backtests-live-desktop-final.jpg`：最终Chrome真实记录页面。
- `comparison-full-final.png`：完整源图／实现并排，单侧1864×1068。
- `comparison-focused-final.png`：对应策略导航、工具栏、表头及两行记录，上参考、下实现。
- `backtests-live-mobile.jpg`、`backtests-mobile-scrolled.jpg`：390×844窄屏与横向滚动。
- `compare-results-live.jpg`、`compare-source-live.jpg`：真实冻结结果和源码对比。
- `same-name-other-strategy-empty.jpg`、`old-unassigned-preserved.jpg`：同名目录隔离和未归属保护。
- `live-api-validation.json`：真实列表、manifest、summary及文件内容一致性证据。

## 修复循环和五项检查

| 检查 | 发现与处理 | 最终结果 |
| --- | --- | --- |
| 字体 | 保留现有字体栈；局部正文14px、表头13px、策略标题16px；组合图检查双行日期和数字基线 | passed |
| 间距 | 初次局部样式被共享样式覆盖，已调整导入顺序。双行日期加padding使实际行高57px，修正为55px，表头45px。DOM实测header y=234/h=45，两行y=279、334/h=55，与源图边界对齐 | passed |
| 颜色 | 白底、浅灰表头、灰蓝标题、细分隔线、红正绿负、蓝状态链接；其他页面共享样式未改 | passed |
| 资产 | 保留QuantWeb标志和Font Awesome；无需新位图。使用既有交换/代码/删除图标。部分选择的原生半选样式已恢复 | passed |
| 文案与状态 | 对应参考默认列和八项列选项；使用真实策略、记录数、日期、状态、冻结指标。数据差异不以参考演示内容补齐 | passed |

全图与重点区域最终比较均通过。允许的内容差异：既有QuantWeb品牌/全站导航、真实记录只有2条、未归属提示；没有真实编译运行能力，不添加参考的编译运行入口。没有未解决的P0/P1/P2视觉问题。

## 真实功能验收

候选只监听 `127.0.0.1:41896`，代理现有API18846/18847；本线程未改当前41846、后端、启动配置或网络。后端契约为AQ24ed98f、AD145d700。

- 策略目录／文件入口 → 编辑策略／该策略回测列表 → 单次结果 → 原策略回测列表 → 编辑策略：passed。刷新后两条记录及归属保持一致。
- Chrome实际提交 `联验_Tailscale_20261024_025756/temporary_daily_ma_test.py`，2024-03-04～03-08及03-11～03-15均成功，任务为`m2job-bf8b88bd97604ea0931f93df1e5f82e4`和`m2job-c51a4ae0237148fc82ac7f6ab376e25a`。未保存或改写策略文件，仅增加两条真实回测。
- 名称与源码都相同的另一目录`联验_20261023_1324`仍为0条；10条旧未归属记录不混入；实际旧失败任务按job进入列表时明确提示未记录归属：passed。
- 勾选、部分勾选、冻结结果对比、冻结源码对比、搜索无匹配／清除、创建时间与初始资金列切换：passed。
- 窄屏页面scrollWidth=390；表格容器clientWidth=390/scrollWidth=1200，实际横向滚动scrollLeft=810可读右侧收益和状态：passed。视口覆盖已reset。
- 应用脚本没有捕获error/warn。记录到两条`chrome-extension://.../zotero.js`和`inject.js`连接错误，属于浏览器扩展，未影响页面；原始记录见`console.json`。
- `npm run check`：48/48；`npm run package`及`git diff --check`：passed。构建保留既有ECharts大chunk提示。105条跨页、变动页、重复/混入身份、失败无结果及旧运行时路由用协议测试覆盖；没有为凑分页截图向真实库制造数十条任务。

## 当前服务能力边界

运行耗时、Python版本、基准/Sharpe/超额指标未由当前契约提供，显示“—”；没有把排队时间冒充执行耗时，没有重算指标。删除历史接口不存在，按钮明确禁用。纯浏览器草稿仍可提交但未归属；旧pending原样恢复。上述属于明确保留的服务边界，不是接线失败。

此候选可供父任务审阅和接入；不代表当前41846已更新。

## F2增补：保存／提交／返回状态（2026-10-24）

final result: passed（独立候选）；当前运行服务接入由父任务协调。

依据 `task-5/report.md`、`audit/findings.json` 的F2，以及 `editor-submission-loss.json`、两份前后UI和accepted请求证据复现。根因是提交前未持久化当前编辑，而重新打开文件无条件拿磁盘源码及最后保存参数覆盖。修复只扩展原Draft记录的未保存状态，不新增另一份源码/参数存储、不用manifest恢复编辑、不改变CSS或页面布局。

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 保存A→编辑B→提交→结果返回→刷新 | Chrome运行候选build；B源码、2024-02-01～02、200000、1m逐字段一致 | passed |
| 明确拒绝与接受后运行失败 | 隔离故障接口分别返回422、failed；源码及参数返回/刷新保留 | passed |
| 响应丢失后编辑C再恢复B | 两次POST请求体与幂等键完全相同，仅一个任务；编辑器仍为C、500000、1d | passed |
| 历史快照与当前编辑隔离 | 查看B只读快照后返回仍为较新的C；保存之后刷新读取新文件状态 | passed |
| 同名文件与纯浏览器草稿 | 不同完整路径独立；无文件草稿提交仍未归属，并可通过原draft入口返回 | passed |
| 既有状态／存储错误 | 单元回归覆盖旧记录不迁移、旧pending不改、未完成字段、配额失败不覆盖、另存为原子写入 | passed |
| 真实本机闭环 | 下述真实任务；源码/日期/资金/频率、返回、刷新及列表往返一致，服务文件前后完全一致 | passed |
| 视觉复核 | `editor-real-before-submit.png`与`editor-real-returned.png`同视口；原布局、控件间距、字体/颜色保留，状态文字和页脚说明无重叠；结果页亦实看 | passed |

真实任务 `m2job-932eb1f9ed2b4a0c86ea7134ab4632a1` 使用已有文件 `联验_Tailscale_20261024_025756/temporary_daily_ma_test.py`，仅在浏览器未保存源码中添加QA注释，2024-03-18～03-22、250000、1d，实际执行成功。没有点击真实文件保存；前后服务源码SHA256均为 `df9392c5e2f13936e8d9670f946488eff472f492e40f6c591146bb7cf731cce6`。当前策略3条，10条未归属保持分离。真实API检查13项均通过，见证据目录的 `editor-real-validation.json`、`editor-real-returned.json`、`editor-real-manifest.json`、`editor-real-list-return.json`。

失败注入使用临时loopback60712和未改动候选dist，只修改测试内存文件、不调用用户服务、不执行Python，也未提供虚构财务指标。其HTTP回执和Chrome观察见 `evidence/editor-state-qa/`，12项检查通过；不能把这部分当作真实引擎成功。真实成功证据独立保存。单元检查累计59项通过，build通过，保留既有ECharts chunk提示。

浏览器一组测试编辑曾被自动审批拒绝且未给具体原因。只读检查确认未执行，再读取隔离服务源码证明无用户文件写入后，按新证据仅重试一次成功；没有绕过到其他UI控制机制。另一次真实结果读取超时，经只读列表确认任务已成功，未重复提交；随后恢复页面观察。没有遗留浏览器验收阻塞。
