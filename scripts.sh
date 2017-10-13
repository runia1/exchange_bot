#!/bin/bash

# build
# no need to build #alias build:all='npm run build:all'

# deploy
alias deploy:bot='node src/prod-bot-runner.js &> logs/bot.log &'
alias deploy:api='node src/api.js &> logs/api.log &'

# kill
alias kill:bot="kill \$(ps aux | grep node.*bot | grep -v grep | awk '{print \$2}') && ps aux | grep node"
alias kill:api="kill \$(ps aux | grep node.*api | grep -v grep | awk '{print \$2}') && ps aux | grep node"

# Defining Colors Used
GREY='\o033[1;30m'
WHITE='\o033[0m'
MAGENTA='\o033[1;35m'
BLUE='\o033[1;34m'
GREEN='\o033[1;32m'
YELLOW='\o033[1;33m'
ORANGE='\o033[1;33m'
RED='\o033[1;31m'
REDWARNING='\o033[4;31m'

# tail
log_color="sed -e 's/INFO/${GREEN}INFO${WHITE}/' -e 's/DEBUG/${GREY}DEBUG${WHITE}/' -e 's/ERROR/${ORANGE}ERROR${WHITE}/' -e 's/CRIT/${RED}CRIT${WHITE}/' -e 's/EMERG/${REDWARNING}EMERG${WHITE}/'"
alias tail:bot="tail -f logs/bot.log | $log_color"
alias tail:api='tail -f logs/api.log'