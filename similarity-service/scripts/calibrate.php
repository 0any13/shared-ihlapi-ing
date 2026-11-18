<?php
// Measures Cohere similarity on example pairs so the thresholds can be set from real numbers.
// Needs only COHERE_API_KEY (no database):   php scripts/calibrate.php
declare(strict_types=1);
require __DIR__ . '/../src/Cohere.php';
require __DIR__ . '/../src/Similarity.php';

if (!Cohere::enabled()) { fwrite(STDERR, "COHERE_API_KEY is not set (put it in the project .env)\n"); exit(1); }

// [text A, text B, should they count as duplicates?]
$pairs = [
    ['What about me intrigues you?', 'Does anything intrigue you about me?', true],
    ['Do you think I fall in love easily? Why or why not?', 'Do you think i am easy to fall in love?', true],
    ['What do you crave more of?', 'What do you want more of in life?', true],
    ["What's your father's name? And tell me one thing about him.", "What's your dad's name and one thing about him?", true],
    ['Describe your perfect day!', 'Describe your perfect date.', true],
    ['Do I seem like a morning person or a night owl?', 'Am I more of an early bird or a night owl?', true],
    ['What do you think my superpower is?', 'What do you think my weakness is?', false],
    ['What do my shoes tell you about me?', 'What does my Instagram tell you about me?', false],
    ['What do you admire most about me?', 'What do you think I fear the most?', false],
    ['What are you passionate about?', 'What lesson took you the longest to un-learn?', false],
    ['Do I seem like a morning person or a night owl?', 'Do I seem like a coffee or tea person?', false],
    ['What smell brings back your childhood?', 'What do you crave more of?', false],
];

$texts = [];
foreach ($pairs as [$a, $b]) { $texts[] = $a; $texts[] = $b; }
$vecs = Cohere::embed($texts);

printf("model: %s\n\n%-6s %-6s %-5s  %s\n", Cohere::model(), 'cosine', 'words', 'dup?', 'pair');
$dupMin = 1.0; $otherMax = 0.0;
foreach ($pairs as $i => [$a, $b, $isDup]) {
    $cos = Similarity::cosine($vecs[2 * $i], $vecs[2 * $i + 1]);
    $w = Similarity::score($a, $b);
    printf("%.3f  %.3f  %-5s  %s  <->  %s\n", $cos, $w, $isDup ? 'YES' : 'no', $a, $b);
    if ($isDup) $dupMin = min($dupMin, $cos); else $otherMax = max($otherMax, $cos);
}
printf("\nlowest cosine among real duplicates: %.3f\nhighest cosine among different questions: %.3f\n", $dupMin, $otherMax);
echo $dupMin > $otherMax
    ? "A threshold between those two numbers separates them. Suggested EMBED_DUPLICATE = " . round(($dupMin + $otherMax) / 2, 2) . "\n"
    : "The ranges overlap: no single threshold separates them perfectly. Paste this output and we will tune it.\n";
