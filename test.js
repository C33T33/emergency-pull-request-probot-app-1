const { suite } = require("uvu");
const assert = require("uvu/assert");

const nock = require("nock");
nock.disableNetConnect();

const {
  Probot,
  ProbotOctokit,
} = require("@probot/adapter-aws-lambda-serverless");

const payload = {
  name: "pull_request",
  id: "1",
  payload: {
    action: "labeled",
    label: {
      name: "emergency"
    },
    repository: {
      owner: {
        login: "probot",
      },
      name: "superbigmono",
      url: "https://api.github.com/repos/robandpdx/superbigmono"
    },
    pull_request: {
      number: 1,
      url: "https://api.github.com/repos/robandpdx/superbigmono/pulls/1",
      html_url: "https://github.com/robandpdx/superbigmono/pull/1"
    },
  },
}

const app = require("./app");

/** @type {import('probot').Probot */
let probot;
const test = suite("app");
test.before.each(() => {
  process.env.ISSUE_TITLE = 'Emergency PR Audit';
  process.env.ISSUE_BODY_FILE = 'issueBody.md';
  process.env.ISSUE_ASSIGNEES = 'tonyclifton,andykaufman';
  process.env.EMERGENCY_LABEL = 'emergency';
  process.env.SLACK_SIGNING_SECRET="fake-signing-secret";
  process.env.SLACK_BOT_TOKEN="xoxb-fake-bot-token"
  process.env.SLACK_CHANNEL_ID="fake-channel-id"

  probot = new Probot({
    // simple authentication as alternative to appId/privateKey
    githubToken: "test",
    // disable logs
    logLevel: "warn",
    // disable request throttling and retries
    Octokit: ProbotOctokit.defaults({
      throttle: { enabled: false },
      retry: { enabled: false },
    }),
  });
  probot.load(app);
});

test.after.each(() => {
  delete process.env.APPROVE_PR;
  delete process.env.CREATE_ISSUE;
  delete process.env.MERGE_PR;
  delete process.env.SLACK_MESSAGE_FILE;
});

// This test will do all 4 things: approve, create issue, merge, and send slack notification
test("recieves pull_request.labeled event, approve, create issue, merge, slack notify", async function () {
  process.env.APPROVE_PR = 'true';
  process.env.CREATE_ISSUE = 'true';
  process.env.MERGE_PR = 'true';
  process.env.SLACK_NOTIFY = 'true';
  process.env.SLACK_MESSAGE_FILE = 'slackMessage.txt';
  
  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .post(
      "/repos/robandpdx/superbigmono/pulls/1/reviews",
      (requestBody) => {
        checkApprovalRequest(requestBody);
        return true;
      }
    )
    .reply(200);
  // mock the request to create the an issue
  mock.post("/repos/robandpdx/superbigmono/issues",
    (requestBody) => {
      checkIssueRequest(requestBody);
      return true;
    }
  ).reply(200, {
    html_url: "https://github.com/robandpdx/superbigmono/issues/44",
  });
  // mock the request to merge the pr
  mock.put("/repos/robandpdx/superbigmono/pulls/1/merge").reply(200);
  // mock the request to send the slack notification
  const mockSlack = nock("https://slack.com")
    .post("/api/chat.postMessage",
    (requestBody) => {
      //console.log(requestBody);
      checkSlackNotifyRequest(requestBody);
      return true;
    }
    ).reply(200, {
      ok: true,
      channel: "C1H9RESGL",
      ts: "1503435956.000247",
      message: {
          text: "Here's a message for you",
          username: "ecto1",
          bot_id: "B19LU7CSY",
          attachments: [
              {
                  text: "This is an attachment",
                  id: 1,
                  fallback: "This is an attachment's fallback"
              }
          ],
          type: "message",
          subtype: "bot_message",
          ts: "1503435956.000247"
      }
    });

  await probot.receive(payload);
  assert.equal(mock.pendingMocks(), []);
  assert.equal(mockSlack.pendingMocks(), []);
});

// This test will only approve the PR
test("recieves pull_request.labeled event, approve PR", async function () {
  process.env.APPROVE_PR = 'true';
  process.env.CREATE_ISSUE = 'false';
  process.env.MERGE_PR = 'false';
  process.env.SLACK_NOTIFY = 'false';

  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .post(
      "/repos/robandpdx/superbigmono/pulls/1/reviews",
      (requestBody) => {
        //console.log(requestBody);
        checkApprovalRequest(requestBody);
        return true;
      }
    )
    .reply(200);

  await probot.receive(payload);
  assert.equal(mock.pendingMocks(), []);
});

// This test will only create an issue
test("recieves pull_request.labeled event, create issue", async function () {
  process.env.APPROVE_PR = 'false';
  process.env.CREATE_ISSUE = 'true';
  process.env.MERGE_PR = 'false';
  process.env.SLACK_NOTIFY = 'false';

  // mock the request to create the an issue
  const mock = nock("https://api.github.com")
    .post("/repos/robandpdx/superbigmono/issues",
      (requestBody) => {
        checkIssueRequest(requestBody);
        return true;
      }
    )
    .reply(200);

  await probot.receive(payload);
  assert.equal(mock.pendingMocks(), []);
});

// This test will only merge the PR
test("recieves pull_request.labeled event, merge the PR", async function () {
  process.env.APPROVE_PR = 'false';
  process.env.CREATE_ISSUE = 'false';
  process.env.MERGE_PR = 'true';
  process.env.SLACK_NOTIFY = 'false';
  
  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .put("/repos/robandpdx/superbigmono/pulls/1/merge").reply(200);

  await probot.receive(payload);
  assert.equal(mock.pendingMocks(), []);
});

// This test will only slack notify
test("recieves pull_request.labeled event, slack notify", async function () {
  process.env.APPROVE_PR = 'false';
  process.env.CREATE_ISSUE = 'false';
  process.env.MERGE_PR = 'false';
  process.env.SLACK_NOTIFY = 'true';
  process.env.SLACK_MESSAGE_FILE = 'slackMessageNoIssue.txt';
  
  // mock the request to send the slack notification
  const mockSlack = nock("https://slack.com")
    .post("/api/chat.postMessage",
    (requestBody) => {
      //console.log(requestBody);
      checkSlackNotifyRequestNoIssue(requestBody);
      return true;
    }
    ).reply(200, {
      ok: true,
      channel: "C1H9RESGL",
      ts: "1503435956.000247",
      message: {
          text: "Here's a message for you",
          username: "ecto1",
          bot_id: "B19LU7CSY",
          attachments: [
              {
                  text: "This is an attachment",
                  id: 1,
                  fallback: "This is an attachment's fallback"
              }
          ],
          type: "message",
          subtype: "bot_message",
          ts: "1503435956.000247"
      }
    });

  await probot.receive(payload);
  assert.equal(mockSlack.pendingMocks(), []);
});

// This test will do all 4 things: approve, create issue, merge, and send slack notification, but the appoval will fail
test("recieves pull_request.labeled event, approve (fails), create issue, merge", async function () {
  process.env.APPROVE_PR = 'true';
  process.env.CREATE_ISSUE = 'true';
  process.env.MERGE_PR = 'true';
  
  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .post(
      "/repos/robandpdx/superbigmono/pulls/1/reviews",
      (requestBody) => {
        checkApprovalRequest(requestBody);
        return true;
      }
    )
    .replyWithError('something awful happened');
  // mock the request to create the an issue
  mock.post("/repos/robandpdx/superbigmono/issues",
    (requestBody) => {
      checkIssueRequest(requestBody);
      return true;
    }
  ).reply(200);
  // mock the request to merge the pr
  mock.put("/repos/robandpdx/superbigmono/pulls/1/merge").reply(200);

  try {
    await probot.receive(payload);
  } catch (err) {
    assert.equal(mock.pendingMocks(), []);
    return;
  }
});

// This test will do all 4 things: approve, create issue, merge, and send slack notification, but creating the issue will fail
test("recieves pull_request.labeled event, approve, create issue (fails), merge", async function () {
  process.env.APPROVE_PR = 'true';
  process.env.CREATE_ISSUE = 'true';
  process.env.MERGE_PR = 'true';
  
  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .post(
      "/repos/robandpdx/superbigmono/pulls/1/reviews",
      (requestBody) => {
        checkApprovalRequest(requestBody);
        return true;
      }
    )
    .reply(200);
  // mock the request to create the an issue
  mock.post("/repos/robandpdx/superbigmono/issues",
    (requestBody) => {
      checkIssueRequest(requestBody);
      return true;
    }
  ).replyWithError('something awful happened');
  // mock the request to merge the pr
  mock.put("/repos/robandpdx/superbigmono/pulls/1/merge").reply(200);

  try {
    await probot.receive(payload);
  } catch (err) {
    assert.equal(mock.pendingMocks(), []);
    return;
  }
});

// This test will do all 4 things: approve, create issue, merge, and send slack notification, but merging the PR will fail
test("recieves pull_request.labeled event, approve, create issue, merge (fails)", async function () {
  process.env.APPROVE_PR = 'true';
  process.env.CREATE_ISSUE = 'true';
  process.env.MERGE_PR = 'true';
  
  // mock the request to add approval to the pr
  const mock = nock("https://api.github.com")
    .post(
      "/repos/robandpdx/superbigmono/pulls/1/reviews",
      (requestBody) => {
        checkApprovalRequest(requestBody);
        return true;
      }
    )
    .reply(200);
  // mock the request to create the an issue
  mock.post("/repos/robandpdx/superbigmono/issues",
    (requestBody) => {
      checkIssueRequest(requestBody);
      return true;
    }
  ).reply(200);
  // mock the request to merge the pr
  mock.put("/repos/robandpdx/superbigmono/pulls/1/merge").replyWithError('something awful happened')

  try {
    await probot.receive(payload);
  } catch (err) {
    assert.equal(mock.pendingMocks(), []);
    return;
  }
});

function checkIssueRequest(requestBody) {
  assert.equal(requestBody.title, "Emergency PR Audit");
  assert.equal(requestBody.assignees, ["tonyclifton", "andykaufman"]);
  assert.equal(requestBody.labels, ["emergency"]);
  assert.equal(requestBody.body, "Pull request https://github.com/robandpdx/superbigmono/pull/1 was labeled as an emergency.\n- [ ] Reviewed");
}

function checkApprovalRequest(requestBody) {
  assert.equal(requestBody.event, "APPROVE");
}

function checkSlackNotifyRequest(requestBody) {
  assert.equal(requestBody.text, "<https://github.com/robandpdx/superbigmono/pull/1|Pull request> has been labeled as `emergency`\n<https://github.com/robandpdx/superbigmono/issues/44|Audit issue created>");
}

function checkSlackNotifyRequestNoIssue(requestBody) {
  assert.equal(requestBody.text, "<https://github.com/robandpdx/superbigmono/pull/1|Pull request> has been labeled as `emergency`");
}

test.run();
