#!/usr/bin/env tsx

/**
 * Comprehensive evaluation of MCP server's historical document search capabilities
 * Tests 31 different prompts across 7 categories to evaluate theological research functionality
 */

import { LocalDataAdapter } from '../../src/adapters/localData.js';
import { formatHistoricalResponse } from '../../src/utils/formatter.js';

interface TestCase {
  id: number;
  category: string;
  prompt: string;
  query: string;
  document?: string;
  docType?: string;
  expectedDocuments?: string[];
  minResults?: number;
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  resultCount: number;
  results: any[];
  relevance: 'high' | 'medium' | 'low' | 'none';
  notes: string;
}

// Define all 31 test prompts
const testCases: TestCase[] = [
  // Basic Document Retrieval (1-5)
  {
    id: 1,
    category: 'Basic Retrieval',
    prompt: 'What does the Westminster Confession say about God\'s eternal decree?',
    query: 'eternal decree',
    document: 'westminster-confession',
    expectedDocuments: ['Westminster Confession'],
    minResults: 1
  },
  {
    id: 2,
    category: 'Basic Retrieval',
    prompt: 'Show me the Chalcedonian Definition\'s statement on Christ\'s two natures',
    query: 'two natures',
    document: 'chalcedonian',
    expectedDocuments: ['Chalcedonian Definition'],
    minResults: 1
  },
  {
    id: 3,
    category: 'Basic Retrieval',
    prompt: 'What does the Athanasian Creed teach about the Trinity?',
    query: 'trinity',
    document: 'athanasian',
    expectedDocuments: ['Athanasian Creed'],
    minResults: 1
  },
  {
    id: 4,
    category: 'Basic Retrieval',
    prompt: 'Find what the 39 Articles say about justification',
    query: 'justification',
    document: '39-articles',
    expectedDocuments: ['39 Articles'],
    minResults: 1
  },
  {
    id: 5,
    category: 'Basic Retrieval',
    prompt: 'What does the Augsburg Confession teach about the church?',
    query: 'church',
    document: 'augsburg',
    expectedDocuments: ['Augsburg Confession'],
    minResults: 1
  },

  // Comparative Theology (6-10)
  {
    id: 6,
    category: 'Comparative Theology',
    prompt: 'Compare what the Westminster Confession and Belgic Confession say about predestination',
    query: 'predestination',
    expectedDocuments: ['Westminster Confession', 'Belgic Confession'],
    minResults: 2
  },
  {
    id: 7,
    category: 'Comparative Theology',
    prompt: 'How do the Canons of Dort differ from the Council of Trent on grace and free will?',
    query: 'grace free will',
    expectedDocuments: ['Canons of Dort', 'Council of Trent'],
    minResults: 2
  },
  {
    id: 8,
    category: 'Comparative Theology',
    prompt: 'What are the differences between the Westminster Shorter and Larger Catechisms on the Ten Commandments?',
    query: 'ten commandments',
    expectedDocuments: ['Westminster Shorter Catechism', 'Westminster Larger Catechism'],
    minResults: 2
  },
  {
    id: 9,
    category: 'Comparative Theology',
    prompt: 'Compare the London Baptist Confession (1689) with the Westminster Confession on baptism',
    query: 'baptism',
    expectedDocuments: ['London Baptist Confession', 'Westminster Confession'],
    minResults: 2
  },
  {
    id: 10,
    category: 'Comparative Theology',
    prompt: 'How does the Baltimore Catechism differ from the Heidelberg Catechism on the sacraments?',
    query: 'sacraments',
    expectedDocuments: ['Baltimore Catechism', 'Heidelberg Catechism'],
    minResults: 2
  },

  // Topic-Based Research (11-15)
  {
    id: 11,
    category: 'Topic Research',
    prompt: 'What do the Reformed confessions say about the Lord\'s Supper?',
    query: 'lord\'s supper',
    minResults: 1
  },
  {
    id: 12,
    category: 'Topic Research',
    prompt: 'Find all references to scripture\'s authority in the historical documents',
    query: 'scripture authority',
    minResults: 1
  },
  {
    id: 13,
    category: 'Topic Research',
    prompt: 'What do the Eastern Orthodox documents teach about icons?',
    query: 'icons',
    expectedDocuments: ['Confession of Dositheus', 'Philaret\'s Catechism'],
    minResults: 1
  },
  {
    id: 14,
    category: 'Topic Research',
    prompt: 'Search for teachings on original sin across all confessions',
    query: 'original sin',
    minResults: 1
  },
  {
    id: 15,
    category: 'Topic Research',
    prompt: 'What do the various catechisms say about prayer?',
    query: 'prayer',
    docType: 'catechism',
    minResults: 1
  },

  // Denominational Identity (16-20)
  {
    id: 16,
    category: 'Denominational Identity',
    prompt: 'What are the distinctive teachings of the 39 Articles that mark Anglicanism?',
    query: 'church england',
    document: '39-articles',
    minResults: 1
  },
  {
    id: 17,
    category: 'Denominational Identity',
    prompt: 'How does the Confession of Dositheus defend Orthodox theology against Protestant views?',
    query: 'protestant',
    document: 'dositheus',
    minResults: 1
  },
  {
    id: 18,
    category: 'Denominational Identity',
    prompt: 'What makes the London Baptist Confession (1689) distinctively Baptist?',
    query: 'baptism believers',
    document: 'london-baptist',
    minResults: 1
  },
  {
    id: 19,
    category: 'Denominational Identity',
    prompt: 'Show me the Council of Trent\'s response to Protestant Reformation doctrines',
    query: 'reform',
    document: 'trent',
    minResults: 1
  },
  {
    id: 20,
    category: 'Denominational Identity',
    prompt: 'What are the key distinctives in the Baltimore Catechism\'s presentation of Catholic teaching?',
    query: 'catholic',
    document: 'baltimore',
    minResults: 1
  },

  // Historical Context (21-24)
  {
    id: 21,
    category: 'Historical Context',
    prompt: 'What does the Chalcedonian Definition say about heresies it was responding to?',
    query: 'heresy',
    document: 'chalcedonian',
    minResults: 1
  },
  {
    id: 22,
    category: 'Historical Context',
    prompt: 'Find statements in the Canons of Dort that address Arminian controversies',
    query: 'arminian',
    document: 'dort',
    minResults: 1
  },
  {
    id: 23,
    category: 'Historical Context',
    prompt: 'What does the Augsburg Confession say about practices it sought to reform?',
    query: 'abuse',
    document: 'augsburg',
    minResults: 1
  },
  {
    id: 24,
    category: 'Historical Context',
    prompt: 'Show me the Council of Trent\'s canons on the Protestant doctrine of sola fide',
    query: 'faith alone',
    document: 'trent',
    minResults: 1
  },

  // Catechetical Learning (25-28)
  {
    id: 25,
    category: 'Catechetical Learning',
    prompt: 'What does the Westminster Shorter Catechism teach about the chief end of man?',
    query: 'chief end',
    document: 'westminster-shorter',
    expectedDocuments: ['Westminster Shorter Catechism'],
    minResults: 1
  },
  {
    id: 26,
    category: 'Catechetical Learning',
    prompt: 'Explain the Baltimore Catechism\'s teaching on the seven sacraments',
    query: 'seven sacraments',
    document: 'baltimore',
    minResults: 1
  },
  {
    id: 27,
    category: 'Catechetical Learning',
    prompt: 'What are the Heidelberg Catechism\'s questions about baptism?',
    query: 'baptism',
    document: 'heidelberg',
    minResults: 1
  },
  {
    id: 28,
    category: 'Catechetical Learning',
    prompt: 'Show me Philaret\'s Catechism on the meaning of the Nicene Creed',
    query: 'nicene creed',
    document: 'philaret',
    minResults: 1
  },

  // Cross-Reference with Scripture (29-31)
  {
    id: 29,
    category: 'Scripture Cross-Reference',
    prompt: 'Find historical documents that reference Romans 3:28 on justification',
    query: 'romans 3:28',
    minResults: 1
  },
  {
    id: 30,
    category: 'Scripture Cross-Reference',
    prompt: 'What do the confessions say about John 6 and the Lord\'s Supper?',
    query: 'john 6',
    minResults: 1
  },
  {
    id: 31,
    category: 'Scripture Cross-Reference',
    prompt: 'Search for how the confessions use Ephesians 2:8-9 on salvation by grace',
    query: 'ephesians 2',
    minResults: 1
  }
];

class HistoricalDocumentEvaluator {
  private adapter: LocalDataAdapter;
  private results: TestResult[] = [];

  constructor() {
    this.adapter = new LocalDataAdapter();
  }

  async runTests(): Promise<void> {
    console.log('🧪 Starting Historical Documents Evaluation\n');
    console.log(`Testing ${testCases.length} prompts across 7 categories\n`);
    console.log('='.repeat(80) + '\n');

    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      this.results.push(result);
      this.printTestResult(result);
    }

    this.printSummary();
  }

  private async runTest(testCase: TestCase): Promise<TestResult> {
    const results = this.adapter.searchDocuments(
      testCase.query,
      testCase.document,
      testCase.docType
    );

    const success = results.length >= (testCase.minResults || 1);
    const relevance = this.assessRelevance(testCase, results);
    const notes = this.generateNotes(testCase, results);

    return {
      testCase,
      success,
      resultCount: results.length,
      results: results.slice(0, 5), // Keep first 5 for analysis
      relevance,
      notes
    };
  }

  private assessRelevance(testCase: TestCase, results: any[]): 'high' | 'medium' | 'low' | 'none' {
    if (results.length === 0) return 'none';

    // Check if expected documents are in results
    if (testCase.expectedDocuments) {
      const foundDocs = results.map(r => r.document);
      const hasAllExpected = testCase.expectedDocuments.every(expected =>
        foundDocs.some(found => found.toLowerCase().includes(expected.toLowerCase()))
      );
      if (hasAllExpected) return 'high';
      if (foundDocs.length > 0) return 'medium';
      return 'low';
    }

    // For queries without specific expected documents
    if (results.length >= (testCase.minResults || 1)) {
      return 'high';
    }

    return 'medium';
  }

  private generateNotes(testCase: TestCase, results: any[]): string {
    const notes: string[] = [];

    if (results.length === 0) {
      notes.push('❌ No results found');
    } else {
      notes.push(`✅ Found ${results.length} result(s)`);
    }

    if (testCase.expectedDocuments && results.length > 0) {
      const foundDocs = new Set(results.map(r => r.document));
      const missing = testCase.expectedDocuments.filter(expected =>
        !Array.from(foundDocs).some(found => found.toLowerCase().includes(expected.toLowerCase()))
      );
      if (missing.length > 0) {
        notes.push(`⚠️  Missing expected documents: ${missing.join(', ')}`);
      }
    }

    // Check result diversity for comparative queries
    if (results.length > 1) {
      const uniqueDocs = new Set(results.map(r => r.document));
      if (uniqueDocs.size === 1) {
        notes.push('⚠️  All results from same document');
      } else {
        notes.push(`📚 Results from ${uniqueDocs.size} different documents`);
      }
    }

    return notes.join('; ');
  }

  private printTestResult(result: TestResult): void {
    const statusIcon = result.success ? '✅' : '❌';
    const relevanceIcon = {
      'high': '🎯',
      'medium': '📊',
      'low': '⚠️',
      'none': '❌'
    }[result.relevance];

    console.log(`${statusIcon} Test #${result.testCase.id}: ${result.testCase.category}`);
    console.log(`   Query: "${result.testCase.query}"`);
    if (result.testCase.document) {
      console.log(`   Document Filter: ${result.testCase.document}`);
    }
    if (result.testCase.docType) {
      console.log(`   Type Filter: ${result.testCase.docType}`);
    }
    console.log(`   ${relevanceIcon} Relevance: ${result.relevance.toUpperCase()}`);
    console.log(`   📊 Results: ${result.resultCount}`);
    console.log(`   ${result.notes}`);

    // Show first result as sample
    if (result.results.length > 0) {
      const firstResult = result.results[0];
      console.log(`   📄 Sample: ${firstResult.document} - ${firstResult.section}`);
      const preview = firstResult.text.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   📝 "${preview}..."`);
    }

    console.log('');
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 EVALUATION SUMMARY');
    console.log('='.repeat(80) + '\n');

    const totalTests = this.results.length;
    const successfulTests = this.results.filter(r => r.success).length;
    const successRate = ((successfulTests / totalTests) * 100).toFixed(1);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests} (${successRate}%)`);
    console.log(`Failed: ${totalTests - successfulTests}\n`);

    // Relevance breakdown
    const relevanceCounts = {
      high: this.results.filter(r => r.relevance === 'high').length,
      medium: this.results.filter(r => r.relevance === 'medium').length,
      low: this.results.filter(r => r.relevance === 'low').length,
      none: this.results.filter(r => r.relevance === 'none').length
    };

    console.log('Relevance Distribution:');
    console.log(`  🎯 High:   ${relevanceCounts.high} (${((relevanceCounts.high / totalTests) * 100).toFixed(1)}%)`);
    console.log(`  📊 Medium: ${relevanceCounts.medium} (${((relevanceCounts.medium / totalTests) * 100).toFixed(1)}%)`);
    console.log(`  ⚠️  Low:    ${relevanceCounts.low} (${((relevanceCounts.low / totalTests) * 100).toFixed(1)}%)`);
    console.log(`  ❌ None:   ${relevanceCounts.none} (${((relevanceCounts.none / totalTests) * 100).toFixed(1)}%)\n`);

    // Category breakdown
    const categoryStats = new Map<string, { total: number, success: number }>();
    for (const result of this.results) {
      const category = result.testCase.category;
      if (!categoryStats.has(category)) {
        categoryStats.set(category, { total: 0, success: 0 });
      }
      const stats = categoryStats.get(category)!;
      stats.total++;
      if (result.success) stats.success++;
    }

    console.log('Performance by Category:');
    for (const [category, stats] of categoryStats) {
      const rate = ((stats.success / stats.total) * 100).toFixed(0);
      console.log(`  ${category}: ${stats.success}/${stats.total} (${rate}%)`);
    }

    // Average results per query
    const avgResults = (this.results.reduce((sum, r) => sum + r.resultCount, 0) / totalTests).toFixed(1);
    console.log(`\nAverage Results per Query: ${avgResults}`);

    // Failed tests detail
    const failedTests = this.results.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('❌ FAILED TESTS DETAIL');
      console.log('='.repeat(80) + '\n');

      for (const result of failedTests) {
        console.log(`Test #${result.testCase.id}: ${result.testCase.prompt}`);
        console.log(`  Query: "${result.testCase.query}"`);
        console.log(`  ${result.notes}\n`);
      }
    }

    // Recommendations
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS');
    console.log('='.repeat(80) + '\n');

    const recommendations: string[] = [];

    if (relevanceCounts.none > 0) {
      recommendations.push(`• ${relevanceCounts.none} queries returned no results - consider expanding topic tags or improving search matching`);
    }

    if (relevanceCounts.low > 0) {
      recommendations.push(`• ${relevanceCounts.low} queries had low relevance - review whether results match user intent`);
    }

    const scriptureTests = this.results.filter(r => r.testCase.category === 'Scripture Cross-Reference');
    const scriptureSuccess = scriptureTests.filter(r => r.success).length;
    if (scriptureSuccess < scriptureTests.length) {
      recommendations.push('• Scripture cross-reference queries need improvement - consider adding explicit Bible verse references in documents');
    }

    const comparativeTests = this.results.filter(r => r.testCase.category === 'Comparative Theology');
    const multiDocResults = comparativeTests.filter(r => {
      const uniqueDocs = new Set(r.results.map(res => res.document));
      return uniqueDocs.size >= 2;
    }).length;
    if (multiDocResults < comparativeTests.length) {
      recommendations.push('• Comparative queries often return results from single documents - improve multi-document ranking');
    }

    if (recommendations.length === 0) {
      console.log('✅ No major issues detected! The historical document search is performing well.');
    } else {
      recommendations.forEach(rec => console.log(rec));
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Run the evaluation
const evaluator = new HistoricalDocumentEvaluator();
await evaluator.runTests();
