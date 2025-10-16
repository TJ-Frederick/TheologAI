/**
 * CCEL (Christian Classics Ethereal Library) Service
 *
 * Provides high-level access to classic Christian texts:
 * - Scripture passages from multiple translations
 * - Classic work sections (Augustine, Calvin, Luther, etc.)
 * - Quotations and fragments from classic works
 */

import { CCELApiAdapter, type CCELScriptureOptions, type CCELWorkSection } from '../adapters/ccelApi.js';
import { CCELCatalogScraper, type CatalogEntry } from '../adapters/ccelCatalogScraper.js';
import { findCommentaryVolume, isMetaCommentary, findCalvinCommentaryVolume, isCalvinMetaCommentary } from '../utils/ccelCommentaryMapper.js';
import { Cache } from '../utils/cache.js';

export interface ClassicTextRequest {
  work: string;        // Work identifier (e.g., 'augustine/confessions')
  section?: string;    // Section identifier (e.g., 'confessions.ii')
  query?: string;      // Optional search query to find relevant sections
}

export interface ClassicTextResponse {
  work: string;
  section: string;
  title: string;
  content: string;
  source: string;
  url: string;
}

export interface ScriptureResponse {
  reference: string;
  translation: string;
  text: string;
  source: string;
}

export class CCELService {
  private adapter: CCELApiAdapter;
  private catalogScraper: CCELCatalogScraper;
  private cache: Cache<any>;

  constructor() {
    this.adapter = new CCELApiAdapter();
    this.catalogScraper = new CCELCatalogScraper();
    this.cache = new Cache();
  }

  /**
   * Look up a Bible passage from CCEL
   *
   * @param reference - Bible reference (e.g., "John 3:16")
   * @param translation - Bible translation (e.g., "KJV", "NRSV", "ASV")
   * @returns Scripture response
   */
  async getScripture(reference: string, translation: string = 'KJV'): Promise<ScriptureResponse> {
    const cacheKey = `ccel:${translation}:${reference}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as ScriptureResponse;
    }

    // Format reference for CCEL API
    const passage = CCELApiAdapter.formatPassageReference(reference);

    // Fetch from CCEL
    const result = await this.adapter.getScripture({
      version: translation.toLowerCase(),
      passage
    });

    const response: ScriptureResponse = {
      reference,
      translation: translation.toUpperCase(),
      text: result.text,
      source: 'CCEL (Christian Classics Ethereal Library)'
    };

    // Cache the response
    this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * Get a section from a classic Christian work
   *
   * @param request - Classic text request
   * @returns Classic text response with content
   */
  async getClassicText(request: ClassicTextRequest): Promise<ClassicTextResponse> {
    let { work, section, query } = request;

    // Intelligent routing: Detect meta-commentary and auto-route to correct volume
    if (isMetaCommentary(work) && query) {
      const volume = findCommentaryVolume(work, query);
      if (volume) {
        // Auto-route to the correct volume
        console.error(`Routing ${work} + "${query}" → ${volume.workId}`);
        work = volume.workId;
        // Don't return here - continue to section resolution below
      } else {
        // Couldn't find volume - provide helpful error
        throw new Error(
          `"${work}" is an index page, not a retrievable work.\n\n` +
          `To access commentaries, use specific volumes or try:\n` +
          `- { work: "calvin", query: "Isaiah 53" }\n` +
          `- { work: "maclaren", query: "Isaiah 53" }\n` +
          `- { work: "expositors-bible", query: "Isaiah 53" }\n\n` +
          `Your query: "${query}"\n` +
          `Couldn't determine the specific volume. Try browsing with: { listWorks: true }`
        );
      }
    }

    // If no section provided but query exists, throw an error
    // (Section resolution should happen in the tool layer before calling this service)
    if (!section) {
      throw new Error('Section identifier is required. The tool layer should resolve queries to section IDs before calling this service.');
    }

    const cacheKey = `ccel:work:${work}:${section}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as ClassicTextResponse;
    }

    // Fetch from CCEL
    const result = await this.adapter.getWorkSection({
      work,
      section
    });

    // Extract title from work/section identifiers
    const title = this.formatWorkTitle(work, section);

    const response: ClassicTextResponse = {
      work,
      section,
      title,
      content: result.content,
      source: 'CCEL (Christian Classics Ethereal Library)',
      url: `https://ccel.org/ccel/${work}/${section}.html`
    };

    // Cache the response
    this.cache.set(cacheKey, response);

    return response;
  }

  /**
   * Get available CCEL translations
   */
  getAvailableTranslations(): string[] {
    return [
      'KJV',    // King James Version
      'NRSV',   // New Revised Standard Version
      'ASV',    // American Standard Version
      'WEB',    // World English Bible
      'YLT',    // Young's Literal Translation
      'Darby'   // Darby Translation
    ];
  }

  /**
   * Get information about popular classic works available on CCEL
   * Organized by era and tradition for easier discovery
   */
  getPopularWorks(): Array<{ work: string; author: string; title: string; sampleSection: string; description: string; category: string }> {
    return [
      // Church Fathers (100-600 AD)
      {
        work: 'augustine/confessions',
        author: 'Augustine of Hippo',
        title: 'Confessions',
        sampleSection: 'confessions.iv',
        description: 'Autobiographical work on grace, conversion, and the soul\'s search for God',
        category: 'Church Fathers'
      },
      {
        work: 'augustine/city_of_god',
        author: 'Augustine of Hippo',
        title: 'City of God',
        sampleSection: 'cityofgod.ii.i',
        description: 'Defense of Christianity and two cities: the City of God and the City of Man',
        category: 'Church Fathers'
      },
      {
        work: 'athanasius/incarnation',
        author: 'Athanasius',
        title: 'On the Incarnation',
        sampleSection: 'incarnation.iii',
        description: 'Classic treatise on the incarnation of Christ',
        category: 'Church Fathers'
      },
      {
        work: 'chrysostom/homilies',
        author: 'John Chrysostom',
        title: 'Homilies',
        sampleSection: 'homilies.iii',
        description: 'Expository sermons on Scripture by the "Golden Mouth"',
        category: 'Church Fathers'
      },

      // Medieval (600-1500)
      {
        work: 'aquinas/summa',
        author: 'Thomas Aquinas',
        title: 'Summa Theologica',
        sampleSection: 'summa.fp.q1.a1',
        description: 'Comprehensive systematic theology in question-and-answer format',
        category: 'Medieval'
      },
      {
        work: 'anselm/cur_deus_homo',
        author: 'Anselm of Canterbury',
        title: 'Cur Deus Homo (Why God Became Man)',
        sampleSection: 'cur_deus_homo.iii',
        description: 'Classic work on the satisfaction theory of atonement',
        category: 'Medieval'
      },
      {
        work: 'bernard/loving_god',
        author: 'Bernard of Clairvaux',
        title: 'On Loving God',
        sampleSection: 'loving_god.iii',
        description: 'Mystical work on the degrees of loving God',
        category: 'Medieval'
      },
      {
        work: 'kempis/imitation',
        author: 'Thomas à Kempis',
        title: 'The Imitation of Christ',
        sampleSection: 'imitation.iii',
        description: 'Devotional classic on following Christ',
        category: 'Medieval'
      },

      // Reformers (1500-1650)
      {
        work: 'calvin/institutes',
        author: 'John Calvin',
        title: 'Institutes of the Christian Religion',
        sampleSection: 'institutes.iii.ii',
        description: 'Comprehensive systematic theology of Reformed Christianity',
        category: 'Reformers'
      },
      {
        work: 'luther/bondage',
        author: 'Martin Luther',
        title: 'The Bondage of the Will',
        sampleSection: 'bondage.iii',
        description: 'Luther\'s treatise on human will and divine sovereignty',
        category: 'Reformers'
      },
      {
        work: 'luther/galatians',
        author: 'Martin Luther',
        title: 'Commentary on Galatians',
        sampleSection: 'galatians.iii',
        description: 'Luther\'s powerful exposition on justification by faith',
        category: 'Reformers'
      },
      {
        work: 'luther/freedom',
        author: 'Martin Luther',
        title: 'The Freedom of a Christian',
        sampleSection: 'freedom.iii',
        description: 'Luther\'s treatise on Christian liberty',
        category: 'Reformers'
      },
      {
        work: 'knox/history',
        author: 'John Knox',
        title: 'History of the Reformation in Scotland',
        sampleSection: 'history.iii',
        description: 'First-hand account of the Scottish Reformation',
        category: 'Reformers'
      },

      // Puritans (1600-1700)
      {
        work: 'bunyan/pilgrim',
        author: 'John Bunyan',
        title: "Pilgrim's Progress",
        sampleSection: 'pilgrim.iii',
        description: 'Allegorical novel of Christian\'s journey to the Celestial City',
        category: 'Puritans'
      },
      {
        work: 'bunyan/grace_abounding',
        author: 'John Bunyan',
        title: 'Grace Abounding to the Chief of Sinners',
        sampleSection: 'grace_abounding.iii',
        description: 'Bunyan\'s spiritual autobiography',
        category: 'Puritans'
      },
      {
        work: 'owen/holy_spirit',
        author: 'John Owen',
        title: 'The Holy Spirit',
        sampleSection: 'holy_spirit.iii',
        description: 'Comprehensive Puritan pneumatology',
        category: 'Puritans'
      },
      {
        work: 'owen/mortification',
        author: 'John Owen',
        title: 'The Mortification of Sin',
        sampleSection: 'mortification.iii',
        description: 'Classic Puritan work on battling sin',
        category: 'Puritans'
      },
      {
        work: 'baxter/saints_rest',
        author: 'Richard Baxter',
        title: "The Saints' Everlasting Rest",
        sampleSection: 'saints_rest.iii',
        description: 'Meditation on the eternal rest of believers',
        category: 'Puritans'
      },
      {
        work: 'brooks/precious_remedies',
        author: 'Thomas Brooks',
        title: 'Precious Remedies Against Satan\'s Devices',
        sampleSection: 'precious_remedies.iii',
        description: 'Puritan spiritual warfare manual',
        category: 'Puritans'
      },

      // Post-Reformation (1700-1900)
      {
        work: 'edwards/religious_affections',
        author: 'Jonathan Edwards',
        title: 'Religious Affections',
        sampleSection: 'religious_affections.iii',
        description: 'Examination of true religious experience',
        category: 'Post-Reformation'
      },
      {
        work: 'edwards/freedom_of_will',
        author: 'Jonathan Edwards',
        title: 'Freedom of the Will',
        sampleSection: 'freedom_of_will.iii',
        description: 'Philosophical defense of divine sovereignty',
        category: 'Post-Reformation'
      },
      {
        work: 'wesley/plain_account',
        author: 'John Wesley',
        title: 'A Plain Account of Christian Perfection',
        sampleSection: 'plain_account.iii',
        description: 'Wesley\'s teaching on entire sanctification',
        category: 'Post-Reformation'
      },
      {
        work: 'wesley/sermons',
        author: 'John Wesley',
        title: 'Sermons on Several Occasions',
        sampleSection: 'sermons.iii',
        description: 'Collection of Wesley\'s most important sermons',
        category: 'Post-Reformation'
      },
      {
        work: 'whitefield/sermons',
        author: 'George Whitefield',
        title: 'Sermons',
        sampleSection: 'sermons.iii',
        description: 'Evangelistic sermons from the Great Awakening',
        category: 'Post-Reformation'
      },
      {
        work: 'spurgeon/treasury',
        author: 'Charles Spurgeon',
        title: 'Treasury of David (Psalms Commentary)',
        sampleSection: 'treasury.iii',
        description: 'Devotional commentary on the Psalms',
        category: 'Post-Reformation'
      },
      {
        work: 'spurgeon/sermons',
        author: 'Charles Spurgeon',
        title: 'Sermons',
        sampleSection: 'sermons.iii',
        description: 'The "Prince of Preachers" expository sermons',
        category: 'Post-Reformation'
      },

      // Devotional Classics
      {
        work: 'law/serious_call',
        author: 'William Law',
        title: 'A Serious Call to a Devout and Holy Life',
        sampleSection: 'serious_call.iii',
        description: 'Challenge to wholehearted Christian devotion',
        category: 'Devotional'
      },
      {
        work: 'taylor/holy_living',
        author: 'Jeremy Taylor',
        title: 'Holy Living',
        sampleSection: 'holy_living.iii',
        description: 'Guide to Christian life and conduct',
        category: 'Devotional'
      },
      {
        work: 'fenelon/christian_perfection',
        author: 'François Fénelon',
        title: 'Christian Perfection',
        sampleSection: 'christian_perfection.iii',
        description: 'Letters on spiritual growth and maturity',
        category: 'Devotional'
      },

      // Apologetics & Philosophy
      {
        work: 'chesterton/orthodoxy',
        author: 'G.K. Chesterton',
        title: 'Orthodoxy',
        sampleSection: 'orthodoxy.iii',
        description: 'Defense and explanation of Christian faith',
        category: 'Apologetics'
      },
      {
        work: 'chesterton/everlasting_man',
        author: 'G.K. Chesterton',
        title: 'The Everlasting Man',
        sampleSection: 'everlasting_man.iii',
        description: 'Christian philosophy of history',
        category: 'Apologetics'
      },
      {
        work: 'paley/evidences',
        author: 'William Paley',
        title: 'Evidences of Christianity',
        sampleSection: 'evidences.iii',
        description: 'Classic work of Christian apologetics',
        category: 'Apologetics'
      },

      // Church History
      {
        work: 'eusebius/church_history',
        author: 'Eusebius',
        title: 'Church History',
        sampleSection: 'church_history.iii',
        description: 'First comprehensive history of early Christianity',
        category: 'History'
      },
      {
        work: 'foxe/martyrs',
        author: 'John Foxe',
        title: 'Foxe\'s Book of Martyrs',
        sampleSection: 'martyrs.iii',
        description: 'Account of Christian martyrs throughout history',
        category: 'History'
      },
      {
        work: 'schaff/church_history',
        author: 'Philip Schaff',
        title: 'History of the Christian Church',
        sampleSection: 'church_history.iii',
        description: 'Comprehensive multi-volume church history',
        category: 'History'
      }
    ];
  }

  /**
   * Format work title from identifiers
   */
  private formatWorkTitle(work: string, section: string): string {
    const [author, workName] = work.split('/');

    // Capitalize and format
    const formattedAuthor = author.charAt(0).toUpperCase() + author.slice(1);
    const formattedWork = workName
      .split(/[_-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const formattedSection = section
      .split('.')
      .map(part => part.toUpperCase())
      .join(' - ');

    return `${formattedAuthor}: ${formattedWork} (${formattedSection})`;
  }

  /**
   * Search for works across the entire CCEL catalog (unlimited discovery)
   *
   * Uses on-demand HTML scraping to search ALL works on CCEL, not just the curated list.
   * Falls back to suggestWorks() if scraping fails.
   *
   * @param query - Search query (author name, work title, or keyword)
   * @returns Array of matching works from full CCEL catalog
   *
   * @example
   * ```typescript
   * const results = await service.searchAllWorks('calvin');
   * // Returns all Calvin works available on CCEL
   *
   * const results = await service.searchAllWorks('institutes');
   * // Returns works with "institutes" in title
   * ```
   */
  async searchAllWorks(query: string): Promise<Array<{ work: string; author: string; title: string; description: string }>> {
    try {
      // Search the full CCEL catalog via scraping
      const catalogEntries = await this.catalogScraper.searchCatalog(query);

      if (catalogEntries.length === 0) {
        // No results from scraping - return empty to trigger fallback
        return [];
      }

      // Convert catalog entries to work format
      // Limit to 66 (one per Bible book) to cover complete commentary sets
      return catalogEntries.slice(0, 66).map(entry => ({
        work: entry.workId,
        author: entry.author,
        title: entry.title,
        description: entry.lifespan
          ? `By ${entry.author} (${entry.lifespan})`
          : `By ${entry.author}`
      }));

    } catch (error) {
      console.error('Error searching CCEL catalog:', error);
      // Return empty array to trigger fallback to curated list
      return [];
    }
  }

  /**
   * Search for works by topic or keyword
   * Enhanced keyword matching for theological topics and themes
   */
  suggestWorks(topic: string): Array<{ work: string; author: string; title: string; reason: string }> {
    const topicLower = topic.toLowerCase();
    const suggestions: Array<{ work: string; author: string; title: string; reason: string }> = [];

    // Map of topics to relevant works
    const topicMap: Record<string, Array<{ work: string; author: string; title: string; reason: string }>> = {
      // Theological Topics
      'grace': [
        { work: 'augustine/confessions', author: 'Augustine', title: 'Confessions', reason: 'Classic work on God\'s grace and conversion' },
        { work: 'owen/holy_spirit', author: 'John Owen', title: 'The Holy Spirit', reason: 'Puritan treatment of grace and the Spirit\'s work' }
      ],
      'salvation': [
        { work: 'augustine/confessions', author: 'Augustine', title: 'Confessions', reason: 'Personal testimony of salvation' },
        { work: 'bunyan/pilgrim', author: 'John Bunyan', title: 'Pilgrim\'s Progress', reason: 'Allegory of the Christian journey to salvation' }
      ],
      'justification': [
        { work: 'luther/galatians', author: 'Martin Luther', title: 'Commentary on Galatians', reason: 'Luther\'s powerful exposition on justification by faith' },
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Book 3 covers justification comprehensively' }
      ],
      'sanctification': [
        { work: 'owen/mortification', author: 'John Owen', title: 'The Mortification of Sin', reason: 'Classic on progressive sanctification' },
        { work: 'wesley/plain_account', author: 'John Wesley', title: 'Christian Perfection', reason: 'Wesley\'s teaching on entire sanctification' }
      ],
      'predestination': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Book 3, Chapters 21-24 on predestination and election' },
        { work: 'augustine/city_of_god', author: 'Augustine', title: 'City of God', reason: 'Early development of predestination doctrine' }
      ],
      'election': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Comprehensive treatment of election' },
        { work: 'edwards/freedom_of_will', author: 'Jonathan Edwards', title: 'Freedom of the Will', reason: 'Defense of divine sovereignty in election' }
      ],
      'sovereignty': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Comprehensive systematic theology emphasizing God\'s sovereignty' },
        { work: 'luther/bondage', author: 'Martin Luther', title: 'The Bondage of the Will', reason: 'Luther on divine sovereignty vs. human free will' }
      ],
      'providence': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Book 1 on God\'s providence' },
        { work: 'aquinas/summa', author: 'Thomas Aquinas', title: 'Summa Theologica', reason: 'Scholastic treatment of divine providence' }
      ],
      'free will': [
        { work: 'luther/bondage', author: 'Martin Luther', title: 'The Bondage of the Will', reason: 'Luther\'s response to Erasmus on free will' },
        { work: 'edwards/freedom_of_will', author: 'Jonathan Edwards', title: 'Freedom of the Will', reason: 'Philosophical defense of compatibilism' }
      ],

      // Christology & Trinity
      'incarnation': [
        { work: 'athanasius/incarnation', author: 'Athanasius', title: 'On the Incarnation', reason: 'Classic patristic work on Christ becoming man' },
        { work: 'anselm/cur_deus_homo', author: 'Anselm', title: 'Why God Became Man', reason: 'Medieval treatment of the incarnation\'s necessity' }
      ],
      'atonement': [
        { work: 'anselm/cur_deus_homo', author: 'Anselm', title: 'Why God Became Man', reason: 'Satisfaction theory of atonement' },
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Book 2 on Christ\'s work of redemption' }
      ],
      'trinity': [
        { work: 'augustine/city_of_god', author: 'Augustine', title: 'City of God', reason: 'Augustine\'s trinitarian theology' },
        { work: 'aquinas/summa', author: 'Thomas Aquinas', title: 'Summa Theologica', reason: 'Scholastic treatment of the Trinity' }
      ],

      // Spiritual Life & Devotion
      'prayer': [
        { work: 'law/serious_call', author: 'William Law', title: 'A Serious Call', reason: 'Challenge to devotional life and prayer' },
        { work: 'bunyan/pilgrim', author: 'John Bunyan', title: 'Pilgrim\'s Progress', reason: 'Includes powerful scenes of prayer and dependence' }
      ],
      'worship': [
        { work: 'taylor/holy_living', author: 'Jeremy Taylor', title: 'Holy Living', reason: 'Guide to Christian worship and conduct' },
        { work: 'law/serious_call', author: 'William Law', title: 'A Serious Call', reason: 'Call to wholehearted devotion' }
      ],
      'devotion': [
        { work: 'kempis/imitation', author: 'Thomas à Kempis', title: 'The Imitation of Christ', reason: 'Classic devotional on following Christ' },
        { work: 'fenelon/christian_perfection', author: 'François Fénelon', title: 'Christian Perfection', reason: 'Letters on spiritual growth' }
      ],
      'suffering': [
        { work: 'baxter/saints_rest', author: 'Richard Baxter', title: 'The Saints\' Everlasting Rest', reason: 'Comfort for suffering through hope of heaven' },
        { work: 'bunyan/pilgrim', author: 'John Bunyan', title: 'Pilgrim\'s Progress', reason: 'Christian\'s journey through trials' }
      ],

      // Church & Kingdom
      'church': [
        { work: 'augustine/city_of_god', author: 'Augustine', title: 'City of God', reason: 'The church as God\'s city vs. the earthly city' },
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Book 4 on the church and sacraments' }
      ],
      'kingdom': [
        { work: 'augustine/city_of_god', author: 'Augustine', title: 'City of God', reason: 'Two kingdoms: City of God and City of Man' },
        { work: 'bunyan/pilgrim', author: 'John Bunyan', title: 'Pilgrim\'s Progress', reason: 'Journey to the Celestial City (Kingdom)' }
      ],
      'city': [
        { work: 'augustine/city_of_god', author: 'Augustine', title: 'City of God', reason: 'Two cities: God\'s kingdom vs. earthly kingdom' }
      ],

      // Sin & Holiness
      'sin': [
        { work: 'owen/mortification', author: 'John Owen', title: 'The Mortification of Sin', reason: 'Puritan classic on battling sin' },
        { work: 'brooks/precious_remedies', author: 'Thomas Brooks', title: 'Precious Remedies', reason: 'Defense against Satan\'s temptations' }
      ],
      'holiness': [
        { work: 'taylor/holy_living', author: 'Jeremy Taylor', title: 'Holy Living', reason: 'Practical guide to holy living' },
        { work: 'wesley/plain_account', author: 'John Wesley', title: 'Christian Perfection', reason: 'Wesley on entire sanctification and holiness' }
      ],
      'temptation': [
        { work: 'brooks/precious_remedies', author: 'Thomas Brooks', title: 'Precious Remedies', reason: 'Puritan guide to resisting temptation' },
        { work: 'bunyan/pilgrim', author: 'John Bunyan', title: 'Pilgrim\'s Progress', reason: 'Christian\'s battles with temptation' }
      ],

      // Faith & Doctrine
      'faith': [
        { work: 'luther/galatians', author: 'Martin Luther', title: 'Commentary on Galatians', reason: 'Justification by faith alone' },
        { work: 'chesterton/orthodoxy', author: 'G.K. Chesterton', title: 'Orthodoxy', reason: 'Defense of Christian faith' }
      ],
      'doctrine': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Comprehensive systematic theology' },
        { work: 'aquinas/summa', author: 'Thomas Aquinas', title: 'Summa Theologica', reason: 'Scholastic systematic theology' }
      ],
      'theology': [
        { work: 'calvin/institutes', author: 'John Calvin', title: 'Institutes', reason: 'Reformed systematic theology' },
        { work: 'aquinas/summa', author: 'Thomas Aquinas', title: 'Summa Theologica', reason: 'Medieval systematic theology' }
      ],

      // Christian Life
      'conversion': [
        { work: 'augustine/confessions', author: 'Augustine', title: 'Confessions', reason: 'Augustine\'s dramatic conversion story' },
        { work: 'bunyan/grace_abounding', author: 'John Bunyan', title: 'Grace Abounding', reason: 'Bunyan\'s spiritual autobiography' }
      ],
      'spiritual growth': [
        { work: 'fenelon/christian_perfection', author: 'François Fénelon', title: 'Christian Perfection', reason: 'Letters on spiritual maturity' },
        { work: 'edwards/religious_affections', author: 'Jonathan Edwards', title: 'Religious Affections', reason: 'True vs. false religious experience' }
      ],
      'christian liberty': [
        { work: 'luther/freedom', author: 'Martin Luther', title: 'The Freedom of a Christian', reason: 'Luther on Christian freedom' }
      ],

      // Apologetics & Philosophy
      'apologetics': [
        { work: 'chesterton/orthodoxy', author: 'G.K. Chesterton', title: 'Orthodoxy', reason: 'Brilliant defense of Christianity' },
        { work: 'paley/evidences', author: 'William Paley', title: 'Evidences of Christianity', reason: 'Classic Christian apologetics' }
      ],
      'philosophy': [
        { work: 'chesterton/everlasting_man', author: 'G.K. Chesterton', title: 'The Everlasting Man', reason: 'Christian philosophy of history' },
        { work: 'aquinas/summa', author: 'Thomas Aquinas', title: 'Summa Theologica', reason: 'Scholastic philosophy and theology' }
      ],

      // History & Martyrdom
      'history': [
        { work: 'eusebius/church_history', author: 'Eusebius', title: 'Church History', reason: 'First history of early Christianity' },
        { work: 'schaff/church_history', author: 'Philip Schaff', title: 'Church History', reason: 'Comprehensive multi-volume history' }
      ],
      'reformation': [
        { work: 'luther/bondage', author: 'Martin Luther', title: 'The Bondage of the Will', reason: 'Key Reformation work' },
        { work: 'knox/history', author: 'John Knox', title: 'History of the Reformation', reason: 'First-hand account of Scottish Reformation' }
      ],
      'martyrs': [
        { work: 'foxe/martyrs', author: 'John Foxe', title: 'Book of Martyrs', reason: 'Account of Christian martyrs' }
      ],

      // Eschatology
      'heaven': [
        { work: 'baxter/saints_rest', author: 'Richard Baxter', title: 'The Saints\' Everlasting Rest', reason: 'Meditation on eternal rest in heaven' }
      ],
      'eternity': [
        { work: 'baxter/saints_rest', author: 'Richard Baxter', title: 'The Saints\' Everlasting Rest', reason: 'Focus on eternal life with God' }
      ]
    };

    // Search for matching topics
    for (const [key, works] of Object.entries(topicMap)) {
      if (topicLower.includes(key)) {
        suggestions.push(...works);
      }
    }

    // Remove duplicates (keeping first occurrence)
    const seen = new Set<string>();
    const uniqueSuggestions = suggestions.filter(s => {
      if (seen.has(s.work)) {
        return false;
      }
      seen.add(s.work);
      return true;
    });

    return uniqueSuggestions;
  }
}
