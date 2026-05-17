require('dotenv').config();

// Discord webhook delivery should not depend on the Node runtime providing global fetch.
// Some deploy environments run older Node versions, so we fall back to node-fetch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetchImpl = global.fetch || require('node-fetch');

async function postWebhook(webhookUrl, payload, label) {
  if (!webhookUrl) {
    console.warn(`[discord] Missing webhook env for ${label}`);
    return;
  }

  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      console.error(`[discord] ${label} failed:`, response.status, text);
    } else if (process.env.DISCORD_WEBHOOK_DEBUG === '1') {
      console.log(`[discord] ${label} ok:`, response.status, text);
    }
  } catch (err) {
    console.error(`[discord] ${label} exception:`, err.message);
  }
}

async function sendChangelogToDiscord(changelog) {
  const webhookUrl =
    process.env.DISCORD_CHANGELOG_WEBHOOK_URL || process.env.DISCORD_CHANGELOG_WEBHOOK;
  const embed = {
    title: `Silk Road Update: ${changelog.version || 'New Update'}`,
    color: 0x00ff88,
    timestamp: new Date().toISOString(),
    fields: [],
  };

  if (changelog.entries?.length > 0) {
    embed.description = changelog.entries.map((e) => `- ${e}`).join('\n');
  }
  if (changelog.thanks)
    embed.fields.push({
      name: 'Thanks',
      value: String(changelog.thanks),
      inline: true,
    });

  await postWebhook(
    webhookUrl,
    {
      content: '<@&1498879548551467008>',
      embeds: [embed],
    },
    'changelog'
  );
}

async function sendPermissionRequestToDiscord({ username, role, note }) {
  const webhookUrl =
    process.env.DISCORD_OWNER_ALERT_WEBHOOK_URL ||
    process.env.DISCORD_PERMISSION_REQUEST_WEBHOOK_URL;
  const embed = {
    title: 'Admin Edit Permission Request',
    color: 0xf0d080,
    timestamp: new Date().toISOString(),
    fields: [
      { name: 'User', value: username || 'unknown', inline: true },
      { name: 'Role', value: role || 'helper', inline: true },
      { name: 'Note', value: note || 'No note provided', inline: false },
    ],
  };

  await postWebhook(webhookUrl, { embeds: [embed] }, 'permission-request');
}

async function sendMaintenanceToDiscord({ active, message }) {
  const webhookUrl = process.env.DISCORD_ANNOUNCEMENTS_WEBHOOK_URL;
  const embed = {
    title: active
      ? 'Silk Road Calculator is under Maintenance'
      : 'Silk Road Calculator is back Online',
    color: active ? 0xff4444 : 0x00ff88,
    timestamp: new Date().toISOString(),
  };
  if (message) embed.description = message;

  await postWebhook(
    webhookUrl,
    {
      content: '<@&1498879548551467008>',
      embeds: [embed],
    },
    'maintenance'
  );
}

async function sendNoticeToDiscord({ active, message, level }) {
  const webhookUrl = process.env.DISCORD_ANNOUNCEMENTS_WEBHOOK_URL;
  const colorMap = {
    info: 0x4488ff,
    warning: 0xf0d080,
    error: 0xff4444,
  };
  const titleMap = {
    info: '📢 Silk Road Notice',
    warning: '⚠️ Silk Road Warning',
    error: '🚨 Silk Road Alert',
  };
  const embed = {
    title: titleMap[level] || titleMap.info,
    color: colorMap[level] || colorMap.info,
    timestamp: new Date().toISOString(),
  };
  if (message) embed.description = message;

  await postWebhook(
    webhookUrl,
    {
      content: active ? '<@&1498879548551467008>' : undefined,
      embeds: [embed],
    },
    'notice'
  );
}

async function sendNewTaskToDiscord({ title, description, todos, createdBy }) {
  const webhookUrl = process.env.DISCORD_NEW_TASKS_WEBHOOK;
  const todoLines = (todos || []).filter(Boolean).map(t => `- [ ] ${t}`).join('\n');
  const embed = {
    title: 'New Task: ' + title,
    color: 0x3d8eff,
    timestamp: new Date().toISOString(),
    fields: [{ name: 'Created by', value: createdBy || 'unknown', inline: true }],
  };
  if (description) embed.description = description;
  if (todoLines) embed.fields.push({ name: 'Todos', value: todoLines, inline: false });
  await postWebhook(webhookUrl, { embeds: [embed] }, 'new-task');
}

async function sendClaimedTaskToDiscord({ title, claimedBy }) {
  const webhookUrl = process.env.DISCORD_CLAIMED_TASKS_WEBHOOK;
  const embed = {
    title: 'Task Claimed: ' + title,
    color: 0xa78bfa,
    timestamp: new Date().toISOString(),
    fields: [{ name: 'Claimed by', value: claimedBy || 'unknown', inline: true }],
  };
  await postWebhook(webhookUrl, { embeds: [embed] }, 'claimed-task');
}

async function sendUnclaimedTaskToDiscord({ title, unclaimedBy }) {
  const webhookUrl = process.env.DISCORD_NEW_TASKS_WEBHOOK;
  const embed = {
    title: 'Task Available: ' + title,
    description: 'This task was released and is available to claim.',
    color: 0xf59e0b,
    timestamp: new Date().toISOString(),
    fields: [{ name: 'Released by', value: unclaimedBy || 'unknown', inline: true }],
  };
  await postWebhook(webhookUrl, { embeds: [embed] }, 'unclaimed-task');
}

async function sendDoneTaskToDiscord({ title, doneBy }) {
  const webhookUrl = process.env.DISCORD_DONE_TASKS_WEBHOOK;
  const embed = {
    title: 'Task Done: ' + title,
    color: 0x34d399,
    timestamp: new Date().toISOString(),
    fields: [{ name: 'Completed by', value: doneBy || 'unknown', inline: true }],
  };
  await postWebhook(webhookUrl, { embeds: [embed] }, 'done-task');
}

module.exports = {
  sendChangelogToDiscord,
  sendMaintenanceToDiscord,
  sendPermissionRequestToDiscord,
  sendNoticeToDiscord,
  sendNewTaskToDiscord,
  sendClaimedTaskToDiscord,
  sendUnclaimedTaskToDiscord,
  sendDoneTaskToDiscord,
};
