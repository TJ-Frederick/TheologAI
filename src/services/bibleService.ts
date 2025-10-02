import { BibleLookupParams, BibleResult } from '../types/index.js';
import { ESVAdapter, NETBibleAdapter } from '../adapters/index.js';
import { APIError } from '../utils/errors.js';

export class BibleService {
  private esvAdapter: ESVAdapter;
  private netBibleAdapter: NETBibleAdapter;

  constructor() {
    this.esvAdapter = new ESVAdapter();
    this.netBibleAdapter = new NETBibleAdapter();
  }

  private mockData: Record<string, { text: string; translation: string }> = {
    'john 3:16': {
      text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
      translation: 'ESV'
    },
    'genesis 1:1': {
      text: 'In the beginning, God created the heavens and the earth.',
      translation: 'ESV'
    },
    'genesis 1:1-3': {
      text: 'In the beginning, God created the heavens and the earth. The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters. And God said, "Let there be light," and there was light.',
      translation: 'ESV'
    },
    'romans 8:28': {
      text: 'And we know that for those who love God all things work together for good, for those who are called according to his purpose.',
      translation: 'ESV'
    },
    'psalm 23:1': {
      text: 'The Lord is my shepherd; I shall not want.',
      translation: 'ESV'
    },
    'philippians 4:13': {
      text: 'I can do all things through him who strengthens me.',
      translation: 'ESV'
    },
    'philippians 2:6-11': {
      text: 'who, though he was in the form of God, did not count equality with God a thing to be grasped, but emptied himself, by taking the form of a servant, being born in the likeness of men. And being found in human form, he humbled himself by becoming obedient to the point of death, even death on a cross. Therefore God has highly exalted him and bestowed on him the name that is above every name, so that at the name of Jesus every knee should bow, in heaven and on earth and under the earth, and every tongue confess that Jesus Christ is Lord, to the glory of God the Father.',
      translation: 'ESV'
    },
    'matthew 28:19-20': {
      text: 'Go therefore and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, teaching them to observe all that I have commanded you. And behold, I am with you always, to the end of the age.',
      translation: 'ESV'
    },
    'isaiah 53:5': {
      text: 'But he was pierced for our transgressions; he was crushed for our iniquities; upon him was the chastisement that brought us peace, and with his wounds we are healed.',
      translation: 'ESV'
    },
    'jeremiah 29:11': {
      text: 'For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.',
      translation: 'ESV'
    },
    'ephesians 2:8-9': {
      text: 'For by grace you have been saved through faith. And this is not your own doing; it is the gift of God, not a result of works, so that no one may boast.',
      translation: 'ESV'
    }
  };

  async lookup(params: BibleLookupParams): Promise<BibleResult> {
    const translation = (params.translation || 'ESV').toUpperCase();

    // Route to appropriate adapter based on translation
    switch (translation) {
      case 'NET':
        return await this.lookupFromNET(params);

      case 'ESV':
      default:
        // Try ESV API if configured
        if (this.esvAdapter.isConfigured()) {
          try {
            return await this.lookupFromESV(params);
          } catch (error) {
            console.warn('ESV API failed, falling back to mock data:', error instanceof Error ? error.message : 'Unknown error');
            // Fall through to mock data
          }
        }

        // Fallback to mock data
        return await this.lookupFromMock(params);
    }
  }

  private async lookupFromESV(params: BibleLookupParams): Promise<BibleResult> {
    const response = await this.esvAdapter.getPassage(params.reference, {
      includeVerseNumbers: true,
      includeShortCopyright: true
    });

    if (!response.passages || response.passages.length === 0) {
      throw new APIError(404, `No passages found for reference: ${params.reference}`);
    }

    // Clean up the passage text
    let text = response.passages[0].trim();

    // Remove footnote markers and extra whitespace
    text = text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

    // Remove any leading/trailing quotation marks that might be artifacts
    text = text.replace(/^["'"']|["'"']$/g, '');

    const result: BibleResult = {
      reference: response.canonical || params.reference,
      translation: params.translation || 'ESV',
      text: text,
      citation: {
        source: 'ESV® Bible',
        copyright: this.esvAdapter.getCopyrightNotice(),
        url: 'https://www.esv.org'
      }
    };

    // Note: Cross-references would need a separate API call to ESV
    // For now, we'll leave this empty when using real API
    if (params.includeCrossRefs) {
      result.crossReferences = [];
    }

    return result;
  }

  private async lookupFromNET(params: BibleLookupParams): Promise<BibleResult> {
    const response = await this.netBibleAdapter.getPassage(params.reference);

    if (!response.text || response.text.length === 0) {
      throw new APIError(404, `No passages found for reference: ${params.reference}`);
    }

    const result: BibleResult = {
      reference: params.reference,
      translation: 'NET',
      text: response.text,
      citation: {
        source: 'NET Bible®',
        copyright: this.netBibleAdapter.getCopyrightNotice(),
        url: 'https://netbible.org'
      }
    };

    // NET Bible doesn't provide cross-references via API
    if (params.includeCrossRefs) {
      result.crossReferences = [];
    }

    return result;
  }

  private async lookupFromMock(params: BibleLookupParams): Promise<BibleResult> {
    const normalizedRef = params.reference.toLowerCase().trim();
    const mockEntry = this.mockData[normalizedRef];

    if (!mockEntry) {
      const availableRefs = Object.keys(this.mockData).map(ref =>
        ref.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      ).sort();

      throw new Error(`Reference "${params.reference}" not available in mock data. Available verses: ${availableRefs.join(', ')}`);
    }

    const result: BibleResult = {
      reference: params.reference,
      translation: params.translation || mockEntry.translation,
      text: mockEntry.text,
      citation: {
        source: 'ESV Bible (Mock Data)',
        copyright: 'The Holy Bible, English Standard Version. Copyright © 2001 by Crossway Bibles',
        url: 'https://www.esv.org'
      }
    };

    if (params.includeCrossRefs) {
      result.crossReferences = [
        { reference: 'Romans 5:8', text: 'but God shows his love for us in that while we were still sinners, Christ died for us.' },
        { reference: '1 John 4:9', text: 'In this the love of God was made manifest among us, that God sent his only Son into the world, so that we might live through him.' }
      ];
    }

    return result;
  }
}