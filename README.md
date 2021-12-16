# minima

一、安装nodejs 下载文件minima_ping.js
  apt install nodejs
  
二、配置nodes.csv，格式参看nodes.csv文件
  email,uid,ip:port,name
  email,uid,ip:port,name

三、使用node运行（指定输入文件，指定结果文件）
  node minima_ping.js ./nodes.csv  ./result.csv
