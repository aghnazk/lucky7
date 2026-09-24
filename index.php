<?php
// Laragon / Apache: serve the prebuilt game from dist/.
header('Location: dist/', true, 302);
exit;
