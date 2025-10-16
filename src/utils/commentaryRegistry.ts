/**
 * Commentary Registry
 *
 * Central registry of all CCEL commentary sets and volumes.
 * Supports both single-author sets (Calvin, MacLaren) and
 * multi-author sets (Expositor's Bible).
 */

export interface CommentaryVolume {
  workId: string;        // CCEL work ID (e.g., "calvin/calcom16")
  author: string;        // Author name
  series?: string;       // Commentary series name (if applicable)
  title: string;         // Volume title
  books: string[];       // Bible books covered (e.g., ["Isaiah 49-66"])
  imageOnly?: boolean;   // Flag for scanned/image-only works (no extractable text)
}

export interface CommentarySeries {
  seriesName: string;           // Display name (e.g., "Expositor's Bible")
  metaWorkIds: string[];        // Generic IDs that should trigger routing
  volumes: CommentaryVolume[];  // All volumes in the series
}

/**
 * Calvin's Commentaries (45 volumes)
 * Single author: John Calvin
 */
export const CALVIN_COMMENTARIES: CommentarySeries = {
  seriesName: "Calvin's Commentaries",
  metaWorkIds: ['calvin/commentaries', 'calvin/calcom', 'calvin/commentary', 'calvin'],
  volumes: [
    { workId: 'calvin/calcom01', author: 'John Calvin', title: 'Commentary on Genesis - Volume 1', books: ['Genesis 1-23'] },
    { workId: 'calvin/calcom02', author: 'John Calvin', title: 'Commentary on Genesis - Volume 2', books: ['Genesis 24-50'] },
    { workId: 'calvin/calcom03', author: 'John Calvin', title: 'Harmony of the Law - Volume 1', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
    { workId: 'calvin/calcom04', author: 'John Calvin', title: 'Harmony of the Law - Volume 2', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
    { workId: 'calvin/calcom05', author: 'John Calvin', title: 'Harmony of the Law - Volume 3', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
    { workId: 'calvin/calcom06', author: 'John Calvin', title: 'Harmony of the Law - Volume 4', books: ['Exodus', 'Leviticus', 'Numbers', 'Deuteronomy'] },
    { workId: 'calvin/calcom07', author: 'John Calvin', title: 'Commentary on Joshua', books: ['Joshua'] },
    { workId: 'calvin/calcom08', author: 'John Calvin', title: 'Commentary on Psalms - Volume 1', books: ['Psalms 1-35'] },
    { workId: 'calvin/calcom09', author: 'John Calvin', title: 'Commentary on Psalms - Volume 2', books: ['Psalms 36-66'] },
    { workId: 'calvin/calcom10', author: 'John Calvin', title: 'Commentary on Psalms - Volume 3', books: ['Psalms 67-92'] },
    { workId: 'calvin/calcom11', author: 'John Calvin', title: 'Commentary on Psalms - Volume 4', books: ['Psalms 93-119'] },
    { workId: 'calvin/calcom12', author: 'John Calvin', title: 'Commentary on Psalms - Volume 5', books: ['Psalms 119-150'] },
    { workId: 'calvin/calcom13', author: 'John Calvin', title: 'Commentary on Isaiah - Volume 1', books: ['Isaiah 1-16'] },
    { workId: 'calvin/calcom14', author: 'John Calvin', title: 'Commentary on Isaiah - Volume 2', books: ['Isaiah 17-32'] },
    { workId: 'calvin/calcom15', author: 'John Calvin', title: 'Commentary on Isaiah - Volume 3', books: ['Isaiah 33-48'] },
    { workId: 'calvin/calcom16', author: 'John Calvin', title: 'Commentary on Isaiah - Volume 4', books: ['Isaiah 49-66'] },
    { workId: 'calvin/calcom17', author: 'John Calvin', title: 'Commentary on Jeremiah and Lamentations - Volume 1', books: ['Jeremiah 1-9', 'Lamentations'] },
    { workId: 'calvin/calcom18', author: 'John Calvin', title: 'Commentary on Jeremiah and Lamentations - Volume 2', books: ['Jeremiah 10-19', 'Lamentations'] },
    { workId: 'calvin/calcom19', author: 'John Calvin', title: 'Commentary on Jeremiah and Lamentations - Volume 3', books: ['Jeremiah 20-29', 'Lamentations'] },
    { workId: 'calvin/calcom20', author: 'John Calvin', title: 'Commentary on Jeremiah and Lamentations - Volume 4', books: ['Jeremiah 30-47', 'Lamentations'] },
    { workId: 'calvin/calcom21', author: 'John Calvin', title: 'Commentary on Jeremiah and Lamentations - Volume 5', books: ['Jeremiah 48-52', 'Lamentations'] },
    { workId: 'calvin/calcom22', author: 'John Calvin', title: 'Commentary on Ezekiel - Volume 1', books: ['Ezekiel 1-12'] },
    { workId: 'calvin/calcom23', author: 'John Calvin', title: 'Commentary on Ezekiel - Volume 2', books: ['Ezekiel 13-20'] },
    { workId: 'calvin/calcom24', author: 'John Calvin', title: 'Commentary on Daniel - Volume 1', books: ['Daniel 1-6'] },
    { workId: 'calvin/calcom25', author: 'John Calvin', title: 'Commentary on Daniel - Volume 2', books: ['Daniel 7-12'] },
    { workId: 'calvin/calcom26', author: 'John Calvin', title: 'Commentary on Hosea', books: ['Hosea'] },
    { workId: 'calvin/calcom27', author: 'John Calvin', title: 'Commentary on Joel, Amos, Obadiah', books: ['Joel', 'Amos', 'Obadiah'] },
    { workId: 'calvin/calcom28', author: 'John Calvin', title: 'Commentary on Jonah, Micah, Nahum', books: ['Jonah', 'Micah', 'Nahum'] },
    { workId: 'calvin/calcom29', author: 'John Calvin', title: 'Commentary on Habakkuk, Zephaniah, Haggai', books: ['Habakkuk', 'Zephaniah', 'Haggai'] },
    { workId: 'calvin/calcom30', author: 'John Calvin', title: 'Commentary on Zechariah, Malachi', books: ['Zechariah', 'Malachi'] },
    { workId: 'calvin/calcom31', author: 'John Calvin', title: 'Harmony of the Gospels - Volume 1', books: ['Matthew', 'Mark', 'Luke'] },
    { workId: 'calvin/calcom32', author: 'John Calvin', title: 'Harmony of the Gospels - Volume 2', books: ['Matthew', 'Mark', 'Luke'] },
    { workId: 'calvin/calcom33', author: 'John Calvin', title: 'Harmony of the Gospels - Volume 3', books: ['Matthew', 'Mark', 'Luke'] },
    { workId: 'calvin/calcom34', author: 'John Calvin', title: 'Commentary on John - Volume 1', books: ['John 1-11'] },
    { workId: 'calvin/calcom35', author: 'John Calvin', title: 'Commentary on John - Volume 2', books: ['John 12-21'] },
    { workId: 'calvin/calcom36', author: 'John Calvin', title: 'Commentary on Acts - Volume 1', books: ['Acts 1-13'] },
    { workId: 'calvin/calcom37', author: 'John Calvin', title: 'Commentary on Acts - Volume 2', books: ['Acts 14-28'] },
    { workId: 'calvin/calcom38', author: 'John Calvin', title: 'Commentary on Romans', books: ['Romans'] },
    { workId: 'calvin/calcom39', author: 'John Calvin', title: 'Commentary on Corinthians - Volume 1', books: ['1 Corinthians 1-14'] },
    { workId: 'calvin/calcom40', author: 'John Calvin', title: 'Commentary on Corinthians - Volume 2', books: ['1 Corinthians 15-16', '2 Corinthians'] },
    { workId: 'calvin/calcom41', author: 'John Calvin', title: 'Commentary on Galatians, Ephesians', books: ['Galatians', 'Ephesians'] },
    { workId: 'calvin/calcom42', author: 'John Calvin', title: 'Commentary on Philippians, Colossians, Thessalonians', books: ['Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians'] },
    { workId: 'calvin/calcom43', author: 'John Calvin', title: 'Commentary on Timothy, Titus, Philemon', books: ['1 Timothy', '2 Timothy', 'Titus', 'Philemon'] },
    { workId: 'calvin/calcom44', author: 'John Calvin', title: 'Commentary on Hebrews', books: ['Hebrews'] },
    { workId: 'calvin/calcom45', author: 'John Calvin', title: 'Commentary on Catholic Epistles', books: ['James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'] },
  ]
};

/**
 * MacLaren's Expositions (19 volumes)
 * Single author: Alexander MacLaren
 */
export const MACLAREN_EXPOSITIONS: CommentarySeries = {
  seriesName: "MacLaren's Expositions of Holy Scripture",
  metaWorkIds: ['maclaren/expositions', 'maclaren'],
  volumes: [
    { workId: 'maclaren/gen_num', author: 'Alexander MacLaren', title: 'Expositions: Genesis to Numbers', books: ['Genesis', 'Exodus', 'Leviticus', 'Numbers'] },
    { workId: 'maclaren/deut', author: 'Alexander MacLaren', title: 'Expositions: Deuteronomy, Joshua, Judges, Ruth, Samuel, Kings', books: ['Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings'] },
    { workId: 'maclaren/2kings_eccl', author: 'Alexander MacLaren', title: 'Expositions: 2 Kings to Ecclesiastes', books: ['2 Kings', 'Ecclesiastes'] },
    { workId: 'maclaren/isa_jer', author: 'Alexander MacLaren', title: 'Expositions: Isaiah and Jeremiah', books: ['Isaiah', 'Jeremiah'] },
    { workId: 'maclaren/ezek_matt1', author: 'Alexander MacLaren', title: 'Expositions: Ezekiel, Daniel, Minor Prophets, Matthew', books: ['Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew'] },
    { workId: 'maclaren/matt2', author: 'Alexander MacLaren', title: 'Expositions: Matthew IX to XVIII', books: ['Matthew 9-18'] },
    { workId: 'maclaren/mark', author: 'Alexander MacLaren', title: 'Expositions: Mark', books: ['Mark'] },
    { workId: 'maclaren/luke', author: 'Alexander MacLaren', title: 'Expositions: Luke', books: ['Luke'] },
    { workId: 'maclaren/john1', author: 'Alexander MacLaren', title: 'Expositions: John - Volume 1', books: ['John 1-14'] },
    { workId: 'maclaren/john2', author: 'Alexander MacLaren', title: 'Expositions: John - Volume 2', books: ['John 15-21'] },
    { workId: 'maclaren/acts', author: 'Alexander MacLaren', title: 'Expositions: Acts', books: ['Acts'] },
    { workId: 'maclaren/rom_cor', author: 'Alexander MacLaren', title: 'Expositions: Romans and Corinthians', books: ['Romans', '1 Corinthians', '2 Corinthians'] },
    { workId: 'maclaren/iicor_tim', author: 'Alexander MacLaren', title: 'Expositions: 2 Corinthians to Timothy', books: ['2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy'] },
    { workId: 'maclaren/psalms', author: 'Alexander MacLaren', title: 'Expositions: Psalms', books: ['Psalms'] },
    { workId: 'maclaren/david', author: 'Alexander MacLaren', title: 'Life of David', books: ['1 Samuel', '2 Samuel'] },
    { workId: 'maclaren/expositorpsalms1', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 1", books: ['Psalms 1-50'] },
    { workId: 'maclaren/expositorpsalms2', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 2", books: ['Psalms 51-100'] },
    { workId: 'maclaren/expositorpsalms3', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 3", books: ['Psalms 101-150'] },
    { workId: 'maclaren/expositorcolphm', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Colossians and Philemon", books: ['Colossians', 'Philemon'] },
  ]
};

/**
 * Expositor's Bible (38+ volumes)
 * Multi-author series edited by W. Robertson Nicoll
 *
 * Note: This is a partial list. Additional volumes can be added as discovered.
 * Some authors wrote multiple volumes (e.g., MacLaren wrote 4 volumes).
 */
export const EXPOSITORS_BIBLE: CommentarySeries = {
  seriesName: "Expositor's Bible",
  metaWorkIds: ['expositors-bible', 'expositor'],
  volumes: [
    // Old Testament
    { workId: 'dods.m/expositorsgenesis', author: 'Marcus Dods', series: "Expositor's Bible", title: "Expositor's Bible: Genesis", books: ['Genesis'] },
    { workId: 'chadwick/expositorsexodus', author: 'George Alexander Chadwick', series: "Expositor's Bible", title: "Expositor's Bible: Exodus", books: ['Exodus'] },
    { workId: 'smith.g/expositorsisaiah1', author: 'George Adam Smith', series: "Expositor's Bible", title: "Expositor's Bible: Isaiah - Volume 1", books: ['Isaiah 1-39'] },
    { workId: 'smith.g/expositorsisaiah2', author: 'George Adam Smith', series: "Expositor's Bible", title: "Expositor's Bible: Isaiah - Volume 2", books: ['Isaiah 40-66'] },
    { workId: 'skinner/expositorsezekiel', author: 'John Skinner', series: "Expositor's Bible", title: "Expositor's Bible: Ezekiel", books: ['Ezekiel'] },
    { workId: 'farrar/expositorsdaniel', author: 'Frederic W. Farrar', series: "Expositor's Bible", title: "Expositor's Bible: Daniel", books: ['Daniel'] },
    { workId: 'watson/expositorsnumbers', author: 'Robert A. Watson', series: "Expositor's Bible", title: "Expositor's Bible: Numbers", books: ['Numbers'] },
    { workId: 'watson/expositorsjudges', author: 'Robert A. Watson', series: "Expositor's Bible", title: "Expositor's Bible: Judges and Ruth", books: ['Judges', 'Ruth'] },
    { workId: 'blaikie/expositorsjoshua', author: 'W. G. Blaikie', series: "Expositor's Bible", title: "Expositor's Bible: Joshua", books: ['Joshua'] },
    { workId: 'harper/expositorsdeuteronomy', author: 'Andrew Harper', series: "Expositor's Bible", title: "Expositor's Bible: Deuteronomy", books: ['Deuteronomy'] },

    // MacLaren's contributions (already in MACLAREN_EXPOSITIONS)
    { workId: 'maclaren/expositorpsalms1', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 1", books: ['Psalms 1-50'] },
    { workId: 'maclaren/expositorpsalms2', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 2", books: ['Psalms 51-100'] },
    { workId: 'maclaren/expositorpsalms3', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Psalms - Volume 3", books: ['Psalms 101-150'] },
    { workId: 'maclaren/expositorcolphm', author: 'Alexander MacLaren', series: "Expositor's Bible", title: "Expositor's Bible: Colossians and Philemon", books: ['Colossians', 'Philemon'] },

    // New Testament
    { workId: 'gibson/expositorsmatthew', author: 'John Monro Gibson', series: "Expositor's Bible", title: "Expositor's Bible: Matthew", books: ['Matthew'] },
    { workId: 'burton/expositorsluke', author: 'Henry Burton', series: "Expositor's Bible", title: "Expositor's Bible: Luke", books: ['Luke'] },
    { workId: 'dods.m/expositorsjohn1', author: 'Marcus Dods', series: "Expositor's Bible", title: "Expositor's Bible: John - Volume 1", books: ['John 1-11'] },
    { workId: 'dods.m/expositorsjohn2', author: 'Marcus Dods', series: "Expositor's Bible", title: "Expositor's Bible: John - Volume 2", books: ['John 12-21'] },
    { workId: 'stokes/expositoracts1', author: 'G. T. Stokes', series: "Expositor's Bible", title: "Expositor's Bible: Acts - Volume 1", books: ['Acts 1-14'] },
    { workId: 'stokes/expositoracts2', author: 'G. T. Stokes', series: "Expositor's Bible", title: "Expositor's Bible: Acts - Volume 2", books: ['Acts 15-28'] },
    { workId: 'moule/expositorsromans', author: 'Handley C. G. Moule', series: "Expositor's Bible", title: "Expositor's Bible: Romans", books: ['Romans'] },
    { workId: 'dods.m/expositorsicorinthians', author: 'Marcus Dods', series: "Expositor's Bible", title: "Expositor's Bible: 1 Corinthians", books: ['1 Corinthians'] },
    { workId: 'denney/expositorsiicorinthians', author: 'James Denney', series: "Expositor's Bible", title: "Expositor's Bible: 2 Corinthians", books: ['2 Corinthians'] },
    { workId: 'findlay/expositorsgalatians', author: 'G. G. Findlay', series: "Expositor's Bible", title: "Expositor's Bible: Galatians", books: ['Galatians'] },
    { workId: 'findlay/expositorsephesians', author: 'G. G. Findlay', series: "Expositor's Bible", title: "Expositor's Bible: Ephesians", books: ['Ephesians'] },
    { workId: 'rainy/expositorsphilippians', author: 'Robert Rainy', series: "Expositor's Bible", title: "Expositor's Bible: Philippians", books: ['Philippians'] },
    { workId: 'denney/expositorsthessalonians', author: 'James Denney', series: "Expositor's Bible", title: "Expositor's Bible: Thessalonians", books: ['1 Thessalonians', '2 Thessalonians'] },
    { workId: 'plummer/expositorspastoral', author: 'Alfred Plummer', series: "Expositor's Bible", title: "Expositor's Bible: Pastoral Epistles", books: ['1 Timothy', '2 Timothy', 'Titus'] },
    { workId: 'edwards/expositorshebrews', author: 'Thomas Charles Edwards', series: "Expositor's Bible", title: "Expositor's Bible: Hebrews", books: ['Hebrews'] },
  ]
};

/**
 * Spurgeon's Treasury of David (6 volumes)
 * Single author: Charles Spurgeon
 * NOTE: Image-only (scanned pages) - provides CCEL links only
 */
export const SPURGEON_TREASURY: CommentarySeries = {
  seriesName: "Spurgeon's Treasury of David",
  metaWorkIds: ['spurgeon/treasury', 'spurgeon/psalms', 'spurgeon'],
  volumes: [
    { workId: 'spurgeon/treasury1', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 1', books: ['Psalms 1-26'], imageOnly: true },
    { workId: 'spurgeon/treasury2', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 2', books: ['Psalms 27-52'], imageOnly: true },
    { workId: 'spurgeon/treasury3', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 3', books: ['Psalms 53-78'], imageOnly: true },
    { workId: 'spurgeon/treasury4', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 4', books: ['Psalms 79-104'], imageOnly: true },
    { workId: 'spurgeon/treasury5', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 5', books: ['Psalms 105-119'], imageOnly: true },
    { workId: 'spurgeon/treasury6', author: 'Charles Spurgeon', title: 'Treasury of David - Volume 6', books: ['Psalms 120-150'], imageOnly: true },
  ]
};

/**
 * Barnes' Notes on the New Testament
 * Single author: Albert Barnes
 * Complete NT coverage (verse-by-verse)
 */
export const BARNES_NOTES: CommentarySeries = {
  seriesName: "Barnes' Notes on the New Testament",
  metaWorkIds: ['barnes/notes', 'barnes/ntnotes', 'barnes'],
  volumes: [
    { workId: 'barnes/ntnotes', author: 'Albert Barnes', title: "Barnes' Notes on the New Testament", books: ['Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'] },
  ]
};

/**
 * All commentary series registry
 */
export const ALL_COMMENTARY_SERIES: CommentarySeries[] = [
  CALVIN_COMMENTARIES,
  MACLAREN_EXPOSITIONS,
  EXPOSITORS_BIBLE,
  SPURGEON_TREASURY,
  BARNES_NOTES,
];

/**
 * Get all volumes across all commentary series
 */
export function getAllVolumes(): CommentaryVolume[] {
  return ALL_COMMENTARY_SERIES.flatMap(series => series.volumes);
}

/**
 * Get all meta-work IDs (generic identifiers that need routing)
 */
export function getAllMetaWorkIds(): string[] {
  return ALL_COMMENTARY_SERIES.flatMap(series => series.metaWorkIds);
}

/**
 * Find series by meta-work ID or author name
 */
export function findSeries(identifier: string): CommentarySeries | null {
  const identifierLower = identifier.toLowerCase();

  // Check meta-work IDs
  for (const series of ALL_COMMENTARY_SERIES) {
    if (series.metaWorkIds.some(id => id.toLowerCase().includes(identifierLower))) {
      return series;
    }
  }

  // Check if it's an author name (first word in work IDs)
  for (const series of ALL_COMMENTARY_SERIES) {
    const firstVolume = series.volumes[0];
    if (firstVolume && firstVolume.workId.toLowerCase().startsWith(identifierLower + '/')) {
      return series;
    }
  }

  return null;
}
