# The pinned build label

`BUILD_LABEL.txt` holds the one build label the Phase 1, Phase 2, Phase 2b and possession suites expect. Each checks that the
page's constant and its footer match it exactly. When a release changes `BUILD_VERSION`, update this file in the same commit.
A label change made in only one place fails these checks.
