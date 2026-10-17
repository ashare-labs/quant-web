import { pendingKey, useDailyTaskComposer } from "./useDailyTaskComposer";
export function DailyTaskComposer({ online }: { online: boolean }) {
  const {
    pending,
    setPending,
    catalogue,
    windowId,
    setWindowId,
    end,
    setEnd,
    name,
    setName,
    cash,
    setCash,
    shares,
    setShares,
    enter,
    setEnter,
    exit,
    setExit,
    template,
    setTemplate,
    strategy,
    setStrategy,
    pythonParameters,
    setPythonParameters,
    dataset,
    setDataset,
    ack,
    setAck,
    error,
    busy,
    setRevision,
    selected,
    choices,
    disabled,
    bind,
    submit,
  } = useDailyTaskComposer(online);
  return (
    <section className="task-panel" aria-label="新建日频回测">
      <h2>新建日频回测</h2>
      <p>
        使用已准入窗口、已绑定数据和明确的策略版本；任务恢复与结果在下方查看。
      </p>
      <button
        disabled={!online || busy}
        onClick={() => setRevision((value) => value + 1)}
      >
        重新读取目录与绑定
      </button>
      {error && (
        <p role="alert" className="task-error">
          {error}
        </p>
      )}
      {pending && (
        <div className="task-pending">
          <strong>有一项创建请求待核对</strong>
          <p>响应中断时任务可能已创建；重试会发送同一请求和幂等键。</p>
          <details>
            <summary>已保存的请求</summary>
            <pre>{JSON.stringify(pending.request, null, 2)}</pre>
          </details>
          <button disabled={!online || busy} onClick={() => void submit(true)}>
            重试原请求
          </button>
          <button
            disabled={!online || busy || !catalogue}
            onClick={() => {
              sessionStorage.removeItem(pendingKey);
              setPending(null);
            }}
          >
            已在任务列表核对，结束此请求
          </button>
        </div>
      )}
      <fieldset disabled={disabled}>
        <details>
          <summary>绑定已导入的数据</summary>
          <p>数据由 AQ 本地 CLI 导入；这里仅接受 dataset ID。</p>
          <label>
            Dataset ID
            <input
              value={dataset}
              onChange={(event) => setDataset(event.target.value)}
              maxLength={64}
            />
          </label>
          <button
            disabled={!/^[a-f0-9]{64}$/.test(dataset) || !catalogue}
            onClick={() => void bind()}
          >
            绑定数据
          </button>
        </details>
        {catalogue && (
          <p>
            绑定摘要：<code>{catalogue.data_binding_sha256 || "尚未绑定"}</code>
            <br />
            {catalogue.configuration_error ||
              catalogue.native_error ||
              (catalogue.native_ready
                ? "原生执行器已就绪"
                : "原生执行器未就绪")}
          </p>
        )}
        <label>
          任务名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          窗口
          <select
            value={windowId}
            onChange={(event) => setWindowId(event.target.value)}
          >
            <option value="">选择已准入窗口</option>
            {catalogue?.windows.map((item) => (
              <option key={item.scope.window_id} value={item.scope.window_id}>
                {item.scope.window_id} · {item.scope.trading_dates[0]}～
                {item.scope.trading_dates.at(-1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          结束日期
          <select value={end} onChange={(event) => setEnd(event.target.value)}>
            <option value="">整个窗口</option>
            {selected?.scope.trading_dates.map((day) => (
              <option key={day}>{day}</option>
            ))}
          </select>
        </label>
        <label>
          初始资金 CNY
          <input
            value={cash}
            onChange={(event) => setCash(event.target.value)}
            inputMode="decimal"
            maxLength={12}
          />
        </label>
        <label>
          策略
          <select
            value={template}
            onChange={(event) => {
              setTemplate(event.target.value);
              setStrategy("");
            }}
          >
            <option value="previous_close_band.v1">前收盘价阈值</option>
            <option value="registered_rules.v1">已注册 JSON 规则</option>
            <option value="registered_python.v1">已注册 Python 策略</option>
          </select>
        </label>
        {template === "previous_close_band.v1" ? (
          <>
            <label>
              目标股数
              <input
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              买入阈值
              <input
                value={enter}
                onChange={(event) => setEnter(event.target.value)}
                inputMode="decimal"
                maxLength={12}
              />
            </label>
            <label>
              卖出阈值
              <input
                value={exit}
                onChange={(event) => setExit(event.target.value)}
                inputMode="decimal"
                maxLength={12}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              已注册版本
              <select
                value={strategy}
                onChange={(event) => setStrategy(event.target.value)}
              >
                <option value="">选择版本</option>
                {choices.map((item) => (
                  <option key={item.version_id} value={item.version_id}>
                    {item.definition.template} · {item.version_id.slice(0, 12)}
                  </option>
                ))}
              </select>
            </label>
            <p>策略先在 AQ 注册；Python 仅支持本机可信代码。</p>
          </>
        )}
        {template === "registered_python.v1" && (
          <label>
            Python 参数 JSON
            <textarea
              value={pythonParameters}
              onChange={(event) => setPythonParameters(event.target.value)}
              rows={3}
            />
          </label>
        )}
        {selected && (
          <>
            <ul>
              {selected.assumptions.map((item) => (
                <li key={item.assumption_id}>{item.description}</li>
              ))}
            </ul>
            <label>
              <input
                type="checkbox"
                checked={ack}
                onChange={(event) => setAck(event.target.checked)}
              />
              已阅读并确认此窗口的假设与限制
            </label>
          </>
        )}
        <button
          disabled={
            !catalogue?.configured ||
            !catalogue.native_ready ||
            !ack ||
            !selected
          }
          onClick={() => void submit()}
        >
          创建日频任务
        </button>
      </fieldset>
    </section>
  );
}
