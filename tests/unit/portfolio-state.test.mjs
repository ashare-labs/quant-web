import test from "node:test";
import assert from "node:assert/strict";
import {
  validPortfolioCash,
  validVolumeRatio,
  restoreOperation,
  completeOperation,
  actionSatisfied,
  canCancel,
} from "../../src/features/portfolio/state.ts";

test("portfolio cash and participation preserve exact supported decimal text", () => {
  for (const value of ["0.00000001", "100000", "10000.20000000", "1".repeat(40)]) assert.equal(validPortfolioCash(value), true);
  for (const value of ["0", "-1", "1e4", "1.000000001", "01", "NaN", "1".repeat(41), 1000]) assert.equal(validPortfolioCash(value), false);
  for (const value of ["", "0.1", "1", "1.000"]) assert.equal(validVolumeRatio(value), true);
  for (const value of ["0", "0.0", "1.01", "-0.1", "1e-1", 1]) assert.equal(validVolumeRatio(value), false);
});
test("reload restores exact uncertain request and refuses another service identity", () => {
  const value = {
    pin: "abc",
    action: "create",
    body: {
      idempotency_key: "qw-original",
      parameters: { initial_cash: "10000.20" },
    },
    state: "pending",
  };
  const storage = { getItem: () => JSON.stringify(value) };
  assert.deepEqual(restoreOperation(storage, "k", "abc"), value);
  assert.throws(() => restoreOperation(storage, "k", "changed"));
  assert.throws(() =>
    restoreOperation({ getItem: () => "{broken" }, "k", "abc"),
  );
});
test("reconcile never treats another request or another task as successful", () => {
  const body = {
    idempotency_key: "same",
    parameters: { initial_cash: "10000" },
  };
  assert.equal(
    actionSatisfied({ action: "create", body }, { request: body }),
    true,
  );
  assert.equal(
    actionSatisfied(
      { action: "create", body },
      { request: { ...body, parameters: { initial_cash: "20000" } } },
    ),
    false,
  );
  assert.equal(
    actionSatisfied(
      { action: "resume", jobId: "one", attemptCount: 1 },
      { job_id: "two", attempt_count: 2, status: "running" },
    ),
    false,
  );
  assert.equal(
    actionSatisfied(
      { action: "resume", jobId: "one", attemptCount: 1 },
      { job_id: "one", attempt_count: 2, status: "failed" },
    ),
    true,
  );
});
test("confirmed operations clear prior errors without changing the frozen request", () => {
  const jobId = `m2job-${"a".repeat(32)}`;
  for (const action of ["create", "cancel", "resume"]) {
    const operation = {
      pin: "abc",
      action,
      body:
        action === "create"
          ? {
              idempotency_key: "qw-original",
              parameters: { initial_cash: "10000.20" },
            }
          : {},
      jobId,
      attemptCount: 1,
      state: "pending",
      error: "503: response lost after commit",
    };
    const completed = completeOperation(operation, jobId);
    assert.equal(completed.state, "done");
    assert.equal(Object.hasOwn(completed, "error"), false);
    assert.deepEqual(completed.body, operation.body);
    assert.equal(completed.jobId, jobId);
    assert.equal(completed.attemptCount, operation.attemptCount);
    assert.equal(operation.state, "pending");
    assert.equal(operation.error, "503: response lost after commit");
    assert.deepEqual(
      restoreOperation({ getItem: () => JSON.stringify(completed) }, "k", "abc"),
      completed,
    );
  }
});
test("reload removes legacy resolved errors but retains pending and rejected errors", () => {
  const value = {
    pin: "abc",
    action: "create",
    body: { idempotency_key: "qw-original" },
    jobId: `m2job-${"b".repeat(32)}`,
    state: "done",
    error: "503: response lost after commit",
  };
  for (const state of ["done", "pending", "rejected"]) {
    const stored = { ...value, state };
    const restored = restoreOperation(
      { getItem: () => JSON.stringify(stored) },
      "k",
      "abc",
    );
    assert.deepEqual(restored.body, stored.body);
    assert.equal(restored.state, state);
    assert.equal(restored.error, state === "done" ? undefined : value.error);
  }
});
test("terminal jobs and pending cancellations cannot be cancelled again", () => {
  assert.equal(
    canCancel({ status: "queued", cancellation_requested_at: null }),
    true,
  );
  assert.equal(
    canCancel({ status: "running", cancellation_requested_at: "now" }),
    false,
  );
  assert.equal(canCancel({ status: "succeeded" }), false);
});
