# Confession Study Skill

Cross-tradition doctrinal comparison using TheologAI's historical document collection.

## When to Use

Use this workflow when the user asks about:
- What a creed or confession says about a topic
- Comparing Catholic, Reformed, Lutheran, Anglican, or Orthodox positions
- Historical theology and doctrinal development
- Catechism questions and answers
- How different traditions understand a doctrine

## Available Documents

TheologAI includes 18 historical documents spanning the major Christian traditions:

**Ecumenical Creeds:**
- Apostles' Creed, Nicene Creed, Athanasian Creed, Chalcedonian Definition

**Reformed:**
- Westminster Confession, Westminster Larger Catechism, Westminster Shorter Catechism
- Heidelberg Catechism, Belgic Confession, Canons of Dort

**Lutheran:**
- Augsburg Confession

**Anglican:**
- 39 Articles of Religion

**Baptist:**
- London Baptist Confession (1689)

**Roman Catholic:**
- Council of Trent, Baltimore Catechism

**Eastern Orthodox:**
- Confession of Dositheus, Philaret Catechism

## Methodology

### Step 1: Identify Relevant Documents

- Call `classic_text_lookup` with action "listWorks" to see all available documents
- Based on the topic, select relevant documents from different traditions

### Step 2: Search Across Traditions

- Call `classic_text_lookup` with action "query" and the doctrinal topic
- This searches across all documents using full-text search
- Review results to identify which documents address the topic

### Step 3: Read Specific Sections

- For each relevant document, call `classic_text_lookup` with action "browseSections"
- Then read the specific relevant sections with action "work"
- Quote the actual text rather than paraphrasing

### Step 4: Biblical Foundations

- Identify the key Scripture passages each confession cites
- Call `bible_lookup` on the most important proof texts
- Call `bible_cross_references` to see the wider biblical support

### Step 5: Comparison

Present a structured comparison:
1. **Doctrine**: Clear statement of the topic being examined
2. **Points of Agreement**: Where traditions converge
3. **Points of Divergence**: Where traditions differ, with charitable representation
4. **Scripture**: Key biblical texts cited by each tradition
5. **Historical Context**: Why each document was written and what it addressed

## Important Notes

- Represent each tradition charitably and accurately
- Quote primary sources rather than characterizing positions
- Note the historical context that shaped each document
- Distinguish between formal confessional positions and popular beliefs
- When traditions disagree, present the strongest version of each argument
