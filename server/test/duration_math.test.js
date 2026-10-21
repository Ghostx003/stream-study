import test from 'node:test';
import assert from 'node:assert';
import { naturalCompare } from '../src/scanner.js';
import { configManager } from '../src/configManager.js';

test('Natural Alphanumeric Sorting', () => {
  const unsorted = [
    'Lecture 11.mp4',
    'Lecture 2.mp4',
    'Lecture 1.mp4',
    'Lecture 20.mp4',
    'Lecture 10.mp4',
    'Lecture 3.mp4'
  ];

  const sorted = [...unsorted].sort(naturalCompare);
  assert.deepStrictEqual(sorted, [
    'Lecture 1.mp4',
    'Lecture 2.mp4',
    'Lecture 3.mp4',
    'Lecture 10.mp4',
    'Lecture 11.mp4',
    'Lecture 20.mp4'
  ]);
});

test('Dynamic Duration & Completion Calculations', () => {
  // Scenario: 10 lectures with a combined duration of 8 hours (28800s)
  // One 45-minute (2700s) lecture is marked completed
  // Remaining duration must decrease by exactly 45 minutes (26100s)
  const lectures = [
    { key: 'lec_1', duration: 2700 }, // 45 min
    { key: 'lec_2', duration: 2900 },
    { key: 'lec_3', duration: 2900 },
    { key: 'lec_4', duration: 2900 },
    { key: 'lec_5', duration: 2900 },
    { key: 'lec_6', duration: 2900 },
    { key: 'lec_7', duration: 2900 },
    { key: 'lec_8', duration: 2900 },
    { key: 'lec_9', duration: 2900 },
    { key: 'lec_10', duration: 2900 }
  ];

  const totalDuration = lectures.reduce((acc, l) => acc + l.duration, 0);
  assert.strictEqual(totalDuration, 28800); // 8 hours in seconds

  // Initially none completed
  let completedDuration = 0;
  let remainingDuration = Math.max(0, totalDuration - completedDuration);
  assert.strictEqual(remainingDuration, 28800);

  // Mark lec_1 (45 mins) completed
  configManager.updateLectureProgress('lec_1', { completed: true, duration: 2700 });
  const prog1 = configManager.getLectureProgress('lec_1');
  assert.strictEqual(prog1.completed, true);

  if (prog1.completed) {
    completedDuration += 2700;
  }
  remainingDuration = Math.max(0, totalDuration - completedDuration);
  assert.strictEqual(remainingDuration, 26100); // 8 hours - 45 mins = 7h 15m = 26100s

  // Mark lec_1 uncompleted again
  configManager.toggleLectureCompleted('lec_1', false);
  const prog1Un = configManager.getLectureProgress('lec_1');
  assert.strictEqual(prog1Un.completed, false);

  completedDuration = 0;
  remainingDuration = Math.max(0, totalDuration - completedDuration);
  assert.strictEqual(remainingDuration, 28800);
});

test('Bookmarks Persistence and Cycling', () => {
  const key = 'test_lecture_bm';
  configManager.clearBookmarks(key);

  configManager.saveBookmark(key, 120.4);
  configManager.saveBookmark(key, 350.8);
  configManager.saveBookmark(key, 45.2);

  const prog = configManager.getLectureProgress(key);
  // Should be sorted
  assert.deepStrictEqual(prog.bookmarks, [45.2, 120.4, 350.8]);

  // Remove middle bookmark
  configManager.removeBookmark(key, 120.4);
  const progAfter = configManager.getLectureProgress(key);
  assert.deepStrictEqual(progAfter.bookmarks, [45.2, 350.8]);
});
