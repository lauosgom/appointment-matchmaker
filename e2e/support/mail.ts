import { expect } from "@playwright/test";

import { MAIL_URL } from "./env";

interface Summary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function messagesTo(address: string): Promise<Summary[]> {
  const res = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  expect(res.ok, `Mailpit search: HTTP ${res.status}`).toBe(true);
  return ((await res.json()) as { messages: Summary[] }).messages;
}

/** Waits for the `n`-th email sent to `address` (1 = first) and returns its subject and text. */
export async function waitForEmail(address: string, n = 1): Promise<{ subject: string; text: string }> {
  let found: Summary[] = [];
  await expect
    .poll(async () => (found = await messagesTo(address)).length, { message: `email #${n} to ${address}`, timeout: 15_000 })
    .toBeGreaterThanOrEqual(n);
  // Mailpit lists newest first.
  const summary = found[found.length - n]!;
  const res = await fetch(`${MAIL_URL}/api/v1/message/${summary.ID}`);
  const message = (await res.json()) as { Subject: string; Text: string };
  return { subject: message.Subject, text: message.Text };
}

export async function countEmailsTo(address: string): Promise<number> {
  return (await messagesTo(address)).length;
}

/** The password-recovery link in an email's text. */
export function resetLink(text: string): string {
  const match = /https?:\/\/\S+\/restablecer\?token=\S+/.exec(text);
  expect(match, `reset link in:\n${text}`).toBeTruthy();
  return match![0];
}
