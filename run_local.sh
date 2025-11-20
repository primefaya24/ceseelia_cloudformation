red=`tput setaf 1`
green=`tput setaf 2`
reset=`tput sgr0`

# SAM local
echo "${green}------> Starting http-api locally <------${reset}"
sam local start-api -t template.yaml --region us-east-1 --profile default