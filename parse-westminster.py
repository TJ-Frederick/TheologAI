#!/usr/bin/env python3
"""
Parser for Westminster Confession of Faith
Converts plain text format to structured JSON
"""

import json
import re
from typing import List, Dict

def parse_westminster(input_file: str, output_file: str):
    """Parse Westminster Confession from plain text to JSON"""

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sections = []
    current_chapter = None
    current_title = None
    current_content = []
    chapter_num = 0

    # Chapter titles mapping (to extract topics)
    chapter_keywords = {
        "holy scripture": ["scripture", "revelation", "authority", "word of god"],
        "god": ["god", "trinity", "attributes"],
        "eternal decree": ["predestination", "election", "sovereignty", "decrees"],
        "creation": ["creation", "providence"],
        "providence": ["providence", "sovereignty"],
        "fall": ["sin", "fall", "adam", "original sin"],
        "covenant": ["covenant", "grace", "works"],
        "christ": ["christ", "mediator", "jesus", "incarnation", "atonement"],
        "free will": ["free will", "depravity"],
        "calling": ["calling", "regeneration", "holy spirit"],
        "justification": ["justification", "faith", "salvation"],
        "adoption": ["adoption", "sonship"],
        "sanctification": ["sanctification", "holiness"],
        "faith": ["faith", "belief"],
        "repentance": ["repentance"],
        "good works": ["good works", "obedience"],
        "perseverance": ["perseverance", "assurance"],
        "assurance": ["assurance", "salvation"],
        "law": ["law", "ten commandments", "moral law"],
        "liberty": ["liberty", "conscience", "freedom"],
        "worship": ["worship", "sabbath"],
        "oath": ["oaths", "vows"],
        "magistrate": ["civil government", "authority"],
        "marriage": ["marriage", "divorce"],
        "church": ["church", "ecclesiology"],
        "communion": ["communion of saints", "fellowship"],
        "sacrament": ["sacraments", "ordinances"],
        "baptism": ["baptism"],
        "lord's supper": ["lord's supper", "eucharist", "communion"],
        "censure": ["church discipline", "excommunication"],
        "synod": ["synods", "councils", "church government"],
        "death": ["death", "resurrection", "intermediate state"],
        "judgment": ["last judgment", "final judgment", "eschatology"]
    }

    def get_topics(title: str) -> List[str]:
        """Extract relevant topics based on chapter title"""
        title_lower = title.lower()
        topics = []
        for keyword, topic_list in chapter_keywords.items():
            if keyword in title_lower:
                topics.extend(topic_list)
        return topics if topics else ["theology"]

    def clean_content(content_lines: List[str], title: str = None) -> str:
        """Clean and format content text"""
        text = ' '.join(content_lines)
        # Remove reference numbers like [6.001]
        text = re.sub(r'\[\d+\.\d+\]', '', text)
        # Remove PCUS/UPCUSA variants - keep UPCUSA version
        text = re.sub(r'\[PCUS [^\]]+\] \[UPCUSA ([^\]]+)\]', r'\1', text)
        text = re.sub(r'\[UPCUSA ([^\]]+)\] \[PCUS [^\]]+\]', r'\1', text)
        text = re.sub(r'\[PCUS ([^\]]+)\]', r'\1', text)
        text = re.sub(r'\[UPCUSA ([^\]]+)\]', r'\1', text)
        # Remove title if it appears at beginning of content
        if title:
            clean_title_text = clean_title(title)
            if text.startswith(clean_title_text):
                text = text[len(clean_title_text):].strip()
        # Clean up extra whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        return text

    def clean_title(title: str) -> str:
        """Clean chapter title"""
        # Remove PCUS/UPCUSA variants - keep simpler version
        title = re.sub(r'\[PCUS ([^\]]+)\] \[UPCUSA ([^\]]+)\]', r'\2', title)
        title = re.sub(r'\[UPCUSA ([^\]]+)\] \[PCUS ([^\]]+)\]', r'\1', title)
        title = re.sub(r'\[PCUS ([^\]]+)\]', r'\1', title)
        title = re.sub(r'\[UPCUSA ([^\]]+)\]', r'\1', title)
        return title.strip()

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect chapter header
        if re.match(r'^CHAPTER [IVX]+ \(PCUS\)', line):
            # Save previous chapter if exists
            if current_chapter is not None and current_title:
                content_text = clean_content(current_content, current_title)
                if content_text:  # Only add if there's content
                    sections.append({
                        "chapter": str(current_chapter),
                        "title": clean_title(current_title),
                        "content": content_text,
                        "topics": get_topics(current_title)
                    })

            # Start new chapter
            chapter_num += 1
            current_chapter = chapter_num
            current_content = []
            current_title = None

            # Look for title in next few lines (may span multiple lines)
            title_parts = []
            for j in range(i+1, min(i+10, len(lines))):
                title_line = lines[j].strip()
                if title_line.startswith('Of '):
                    title_parts.append(title_line)
                elif title_parts and title_line and not title_line.startswith('['):
                    # Continuation of title
                    title_parts.append(title_line)
                elif title_parts:
                    # Title is complete
                    break
            if title_parts:
                current_title = ' '.join(title_parts)

            i += 1
            continue

        # Skip empty lines and header lines
        if (not line or
            line.startswith('Presbyterian Church') or
            line.startswith('in the United States') or
            line.startswith('The United Presbyterian') or
            line.startswith('CHAPTER') or
            line.startswith('Of the Old Testament') or
            line.startswith('Of the New Testament') or
            (line.startswith('Of ') and line == current_title)):
            i += 1
            continue

        # Collect content
        if current_chapter is not None:
            # Skip book lists
            if not re.match(r'^[IVX]+ (Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)', line):
                if not re.match(r'^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)', line):
                    current_content.append(line)

        i += 1

    # Don't forget the last chapter
    if current_chapter is not None and current_title:
        content_text = clean_content(current_content, current_title)
        if content_text:
            sections.append({
                "chapter": str(current_chapter),
                "title": clean_title(current_title),
                "content": content_text,
                "topics": get_topics(current_title)
            })

    # Collect all unique topics
    all_topics = set()
    for section in sections:
        all_topics.update(section["topics"])

    # Create final JSON structure
    confession = {
        "title": "Westminster Confession of Faith",
        "type": "confession",
        "date": "1647",
        "topics": sorted(list(all_topics)),
        "sections": sections
    }

    # Write to file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(confession, f, indent=2, ensure_ascii=False)

    print(f"✓ Parsed {len(sections)} chapters")
    print(f"✓ Wrote to {output_file}")

if __name__ == "__main__":
    parse_westminster(
        "/tmp/westminster-confession.txt",
        "/Users/tyler/Projects/TheologAI/data/confessions/westminster-confession.json"
    )
