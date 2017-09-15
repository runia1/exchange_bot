#!/bin/bash

# build
alias build:bot='npm run build:bot'
alias build:api='npm run build:api'

# deploy
alias deploy:bot='node build/src/bot.js &> logs/bot.log &'
alias deploy:api='node build/src/api.js &> logs/api.log &'

# kill
alias kill:bot="kill \$(ps aux | grep node.*bot | grep -v grep | awk '{print \$2}')"
alias kill:api="kill \$(ps aux | grep node.*api | grep -v grep | awk '{print \$2}')"

#tail
alias tail:bot='tail -f logs/bot.log'
alias tail:api='tail -f logs/api.log'