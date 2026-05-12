export async function sendDeadlineReminder(message: string): Promise<void> {
  const mode = process.env.NOTIFICATION_MODE ?? 'teams';
  if (mode === 'teams') {
    await sendTeamsNotification(message);
  } else {
    console.log('[DIRECT NOTIFICATION]', message);
  }
}

async function sendTeamsNotification(message: string): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  const deadlineDate = process.env.DEADLINE_DATE ?? '';

  if (!webhookUrl) {
    console.warn('Teams webhook URL not configured — notification not sent');
    return;
  }

  const card = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'FF6B35',
    summary: 'Compliance Deadline Reminder',
    sections: [
      {
        activityTitle: 'Compliance Deadline Reminder',
        activitySubtitle: `Sent: ${new Date().toISOString().slice(0, 10)}`,
        activityText: message,
        facts: [
          { name: 'Deadline', value: deadlineDate },
          { name: 'Mode', value: 'Teams Webhook' },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  if (!res.ok) {
    throw new Error(`Failed to send Teams notification: ${res.status}`);
  }
}
