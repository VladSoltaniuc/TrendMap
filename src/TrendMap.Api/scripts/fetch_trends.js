#!/usr/bin/env node
"use strict";

const googleTrends = require("google-trends-api");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { keyword: "", geo: "", timeframe: "today 5-y", mock: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keyword") result.keyword = args[++i];
    else if (args[i] === "--geo") result.geo = args[++i];
    else if (args[i] === "--timeframe") result.timeframe = args[++i];
    else if (args[i] === "--mock") result.mock = true;
  }
  return result;
}

function aggregateByDate(points) {
  const byDate = new Map();
  for (const p of points) {
    const entry = byDate.get(p.date);
    if (entry) {
      entry.sum += p.value;
      entry.count += 1;
    } else {
      byDate.set(p.date, { sum: p.value, count: 1 });
    }
  }
  return [...byDate.entries()]
    .map(([date, { sum, count }]) => ({ date, value: Math.round(sum / count) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mockPoints(keyword, timeframe) {
  const { startTime, endTime } = timeframeToStartEnd(timeframe);
  const points = [];
  const cur = new Date(startTime);
  let v = 40;
  while (cur <= endTime) {
    v = Math.min(100, Math.max(1, v + (Math.random() * 10 - 5)));
    points.push({ date: cur.toISOString().slice(0, 10), value: Math.round(v) });
    cur.setDate(cur.getDate() + 7);
  }
  return points;
}

function timeframeToStartEnd(tf) {
  const now = new Date();
  const todayMatch = tf.match(/^today\s+(\d+)-([yYmM])$/);
  if (todayMatch) {
    const n = parseInt(todayMatch[1], 10);
    const unit = todayMatch[2].toLowerCase();
    const start = new Date(now);
    if (unit === "y") start.setFullYear(start.getFullYear() - n);
    else start.setMonth(start.getMonth() - n);
    return { startTime: start, endTime: now };
  }
  const nowMatch = tf.match(/^now\s+(\d+)-([dDhH])$/);
  if (nowMatch) {
    const n = parseInt(nowMatch[1], 10);
    const unit = nowMatch[2].toLowerCase();
    const start = new Date(now);
    if (unit === "d") start.setDate(start.getDate() - n);
    else start.setHours(start.getHours() - n);
    return { startTime: start, endTime: now };
  }
  const range = tf.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
  if (range) {
    return { startTime: new Date(range[1]), endTime: new Date(range[2]) };
  }
  // fallback: 5 years
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 5);
  return { startTime: start, endTime: now };
}

function emitError(msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + "\n");
  process.stderr.write(msg + "\n");
}

async function main() {
  const { keyword, geo, timeframe, mock } = parseArgs();

  if (!keyword) {
    emitError("--keyword is required");
    process.exit(1);
  }

  const { startTime, endTime } = timeframeToStartEnd(timeframe);

  if (mock) {
    const points = mockPoints(keyword, timeframe);
    process.stdout.write(JSON.stringify({ keyword, geo, timeframe, points }) + "\n");
    return;
  }

  let raw;
  try {
    raw = await googleTrends.interestOverTime({
      keyword,
      geo: geo || "",
      startTime,
      endTime,
      granularTimeResolution: true,
    });
  } catch (e) {
    emitError(`Google Trends request failed: ${e.message || e}`);
    process.exit(1);
  }

  // Google returns an HTML error page (not JSON) when rate-limiting.
  if (typeof raw === "string" && raw.trimStart().startsWith("<")) {
    emitError("Google Trends 429 rate limited — too many requests from this IP.");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    emitError(`Failed to parse Google Trends response: ${e.message}`);
    process.exit(1);
  }

  const timeline = parsed?.default?.timelineData;
  if (!Array.isArray(timeline) || timeline.length === 0) {
    emitError(`No data for keyword '${keyword}' in geo '${geo}'.`);
    process.exit(1);
  }

  const rawPoints = timeline
    .filter(p => !p.isPartial)
    .map(p => {
      const d = new Date(parseInt(p.time, 10) * 1000);
      const date = d.toISOString().slice(0, 10);
      const value = p.value[0];
      return { date, value };
    });

  // Sub-day timeframes return hourly samples; collapse to daily means so
  // downstream cadence inference and forecasting see one point per day.
  const points = aggregateByDate(rawPoints);

  process.stdout.write(JSON.stringify({ keyword, geo, timeframe, points }) + "\n");
}

main();
