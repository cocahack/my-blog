---
title: Fream 1차 프로젝트 무중단 배포
date: "2022-01-29T20:12:00Z"
template: "post"
draft: false
slug: "29"
category: "fream"
tags:
  - "토이프로젝트"
  - "fream"
description: "Fream 앱의 1차 프로젝트에 무중단 배포를 적용한 과정을 기록했다."
---

## 개요

[이전 글](/posts/28) 에서 CI/CD를 Jenkins를 사용해 구축한 과정을 단계별로 서술했다. CD의 마지막 단계에서 원격 서버에 있는 스크립트를 실행함으로써 무중단 배포가 이뤄진다. 

### 서버 구성

서버 구성은 다음과 같다.

![Fream v1 architecture](/media/2022-30-01/1.jpg)

Jenkins가 원격 서버의 스크립트를 실행하면, 빌드된 최신 이미지를 가져와서 새로운 앱 컨테이너를 실행한다. 새 컨테이너가 정상적으로 실행되면, nginx가 새로운 앱 컨테이너를 바라보게 만들고 기존 컨테이너는 제거되는 방식이다.

### 배포

#### 환경 구성

CD가 실행되기 전에 패키지와 Nginx, MySQL DB 컨테이너가 미리 준비되어 있어야 했다. 

가장 먼저, 필요한 패키지를 설치했다.

```sh
#!/bin/bash

# For Ubuntu 16.04

sudo apt-get update
sudo apt-get install --no-install-recommends -y \
    git \
    curl \
    docker.io
```

그런 다음, Nginx와 MySQL DB 컨테이너를 배포했다. 배포 스크립트는 다음과 같다.

```sh
#!/bin/bash

set -e

## load environment variables
. ./load-envs.sh

mkdir -p $MYSQL_DATA_DIR
mkdir -p $MYSQL_CONF_DIR

mkdir -p $NGINX_CONF_DIR

docker network create fream || true

docker run -d --name fream-mysql --network $FREAM_NETWORK_NAME                              \
        --restart always -v $MYSQL_CONF_DIR:/etc/mysql/conf.d/                              \
        -v $MYSQL_DATA_DIR:/var/lib/mysql/ -p 3306:3306                                     \
        -e TZ=Asia/Seoul -e MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD                        \
        -e MYSQL_USER=$MYSQL_USER -e MYSQL_PASSWORD=$MYSQL_PASSWORD                         \
        -e MYSQL_DATABASE=$MYSQL_DATABASE                                                   \
        mysql:8                                                                             \
        mysqld --default-authentication-plugin=mysql_native_password --ngram-token-size=2

docker run -d --name fream-nginx --network $FREAM_NETWORK_NAME \
        --restart always -v $NGINX_CONF_DIR:/etc/nginx/conf.d/ \
        -p 18080:18080 -p 80:80 -e TZ=Asia/Seoul               \
        nginx:latest
```

배포 환경에서 `docker network`를 따로 구성하여 이 네트워크를 사용했다. 이는 서비스 간 연결을 할 때 DNS를 사용하기 위해서 이렇게 했다. 기본 bridge 네트워크를 사용하면 컨테이너 이름으로 DNS를 사용할 수 없다.

여기서 배포할 때 여러 변수들을 사용했는데, 이 변수는 미리 값을 설정해놓은 스크립트를 실행하여 환경변수로부터 불러오도록 스크립트를 작성했다. 환경변수를 설정하는 스크립트 `load-envs.sh`의 내용은 다음과 같다. 

```sh
#!/bin/bash

export BASE_DIR=/home/fream/fream-conf

export MYSQL_DATA_DIR=$BASE_DIR/mysql/data/
export MYSQL_CONF_DIR=$BASE_DIR/mysql/conf.d/

export NGINX_CONF_DIR=$BASE_DIR/nginx/

export MYSQL_ROOT_PASSWORD=
export MYSQL_USER=
export MYSQL_PASSWORD=
export MYSQL_DATABASE=fream

export FREAM_NETWORK_NAME=fream

export FREAM_DIR=$BASE_DIR/fream

export IMAGE_REGISTRY=127.0.0.1:5000

export HEALTH_CHECK_POINT=/products
export PORT=8080
```

이 스크립트는 무중단 배포 스크립트에도 사용했다.

#### 무중단 배포

무중단 배포는 향로님의 [블로그 글](https://jojoldu.tistory.com/267)을 참고하여 작성했다. 

글의 내용과 다르게 무중단 배포 과정을 조금 수정했다. 애플리케이션 컨테이너를 하나만 사용하기 때문에 작성된 내용대로 기존 컨테이너 정지 후 새로운 컨테이너를 실행하게 되면 잠깐의 시간동안 요청을 받을 수 없는 상태가 된다. 때문에 새로운 컨테이너를 먼저 올리고 Nginx의 `proxy_pass` 값을 변경한 뒤 기존 컨테이너를 제거하는 방식으로 수정했다. 

```sh
#!/bin/bash

find_current_active_set () {
	CONTAINER_NUMBERS=$(docker ps --filter "name=fream-app-set1" --format "{{.Names}}" | wc -l)

	if [ $CONTAINER_NUMBERS -gt 0 ]
	then
		NEXT_ACTIVE_SET=fream-app-set2
		NEXT_ACTIVE_PORT=8082
		LAST_ACTIVE_SET=fream-app-set1
	else
		NEXT_ACTIVE_SET=fream-app-set1
		NEXT_ACTIVE_PORT=8081
		LAST_ACTIVE_SET=fream-app-set2
	fi
}

try_to_remove_container() {
	docker stop $1 || true
	docker rm $1 || true
}

############################# START ###################################

## load environment variables
. ./load-envs.sh

## Define variables
FREAM_APP_VERSION=$1

if [ -z $FREAM_APP_VERSION ]
then
	echo "Usage: ./020-deploy-fream.sh [fream_version]"
	echo ""
        echo "Example: ./020-deploy-fream.sh 1.0.1"
	exit 1
fi


mkdir -p $FREAM_DIR

find_current_active_set

echo $NEXT_ACTIVE_SET

## Run latest application
docker run -d --name $NEXT_ACTIVE_SET -p $NEXT_ACTIVE_PORT:$NEXT_ACTIVE_PORT \
	--network fream -e SERVER_PORT=$NEXT_ACTIVE_PORT                           \
	-e SPRING_PROFILES_ACTIVE=prod -e FREAM_DB_URL=fream-mysql                 \
	-e FREAM_DB_PORT=3306 -e FREAM_DB_SCHEME=$MYSQL_DATABASE                   \
	-e FREAM_DB_USERNAME=$MYSQL_USER -e FREAM_DB_PASSWORD=$MYSQL_PASSWORD      \
	-e TZ=Asia/Seoul $IMAGE_REGISTRY/fream:$FREAM_APP_VERSION

## Referenced by https://jojoldu.tistory.com/267
for count in {1..10}
do
	echo "try to run health check"
	status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$NEXT_ACTIVE_PORT$HEALTH_CHECK_POINT)

	if [ $status_code -ge 200 ] && [ $status_code -lt 300 ]
	then
		break
	fi

	if [ $count -eq 10 ]
	then
		echo "Fail to Health checking"
		echo "Remove new containers"
		try_to_remove_container $NEXT_ACTIVE_SET
		exit 2
	fi

	echo "Retry Health Check after 5 seconds"
	sleep 10
done

echo "set \$service_url http://${NEXT_ACTIVE_SET}:${NEXT_ACTIVE_PORT};" | sudo tee $NGINX_CONF_DIR/service-url.inc

echo "Reload nginx"
docker exec fream-nginx nginx -s reload

echo "Remove previous container"
try_to_remove_container $LAST_ACTIVE_SET
```

#### Nginx conf 파일 구성

미리 작성해놓은 파일을 컨테이너 실행 시 마운트하여 Nginx 컨테이너가 사용할 수 있게 만들어 두었다. Configuration 파일의 내용은 다음과 같다. 

동적 프록시 구성을 위해 `service-url.inc` 파일을 include했다. 해당 파일의 내용은 다음과 같다. 

```text
set $service_url http://fream-app-set1:8081;
```

이렇게 `$service_url`의 값을 지정하여 Nginx 설정에 사용한다.

```conf
server {
	listen 18080;

	include /etc/nginx/conf.d/service-url.inc;

	location / {
		resolver 127.0.0.11 ipv6=off;
		proxy_pass $service_url;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header Host $http_host;
	}
}
```

추가로, `resolver` 디렉티브를 사용했는데, 이는 `service-url.inc` 파일에서 읽어온 URL을 DNS로 해석하지 못해 502 에러가 발생하는 문제를 막기 위해서이다.

## Conclusion

두 편에 걸쳐 CI/CD를 구축한 과정을 기록했다.

나름 공을 많이 들이긴 했지만, 더 큰 시스템에서 자동화를 구축해야 한다면 개선할 부분이 더 남아있다.

컨테이너 배포는 단순히 docker CLI를 사용하여 처리했지만, 더 큰 시스템과 Load balancing, HA 등 요구 사항을 처리하기 위해서는 컨테이너 오케스트레이션이 필요할 것이다.

또한, 애플리케이션 배포에 사용할 환경 변수는 직접 스크립트를 작성하여 처리했다. 그러나 민감한 값 노출 등 보안적인 이슈와 설정 값들의 관리를 위해 hashicorp 사의 Vault나 Spring Cloud Config 등 externalized configuraion을 도입해볼 수 있을 것이다.

Physical machine, virtual machine 등 컨테이너가 아닌 환경의 구성을 관리하기 위해 ansible 등의 configuration management 도입도 필요하다.

이외에도 효율적인 운영과 자동화를 위한 여러 도구들을 검토해야 할 것이다. 
