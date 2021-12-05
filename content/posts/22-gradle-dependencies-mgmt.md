---
title: Gradle의 의존성 관리
date: "2021-12-05T01:23:05Z"
template: "post"
draft: false
slug: "22"
category: "Gradle"
tags:
  - "Gradle"
  - "build"
description: "Gradle의 의존성 관리 방법과 여러 문제 상황에 대응하는 방법을 조사했다."
---

## 의존성

의존성에는 direct와 transitive 가 있다. 각각을 정리하면 다음과 같다.

- direct: 프로젝트가 직접 의존하는 모듈
- transitive: 프로젝트가 의존하는 모듈이 의존하는 모듈

프로젝트 기준에서 보면, transitive 의존성은 간접적인 의존성이 되는 것이다.

### 의존성 확인하기

Gradle 명령어로 프로젝트의 의존성을 확인할 수 있다. 

```bash
$ ./gradlew dependencies --configuration compileClasspath
```

> --configuration 옵션으로 하나의 configuration에 대한 의존성만 확인해볼 수도 있다.

그러면 다음과 같이 의존성 트리가 출력된다. 

```text
compileClasspath - Compile classpath for source set 'main'.
+--- org.projectlombok:lombok -> 1.18.20
+--- org.springframework.boot:spring-boot-starter-validation -> 2.5.3
|    +--- org.springframework.boot:spring-boot-starter:2.5.3
|    |    +--- org.springframework.boot:spring-boot:2.5.3
|    |    |    +--- org.springframework:spring-core:5.3.9
|    |    |    |    \--- org.springframework:spring-jcl:5.3.9
|    |    |    \--- org.springframework:spring-context:5.3.9
|    |    |         +--- org.springframework:spring-aop:5.3.9
|    |    |         |    +--- org.springframework:spring-beans:5.3.9
|    |    |         |    |    \--- org.springframework:spring-core:5.3.9 (*)
|    |    |         |    \--- org.springframework:spring-core:5.3.9 (*)
|    |    |         +--- org.springframework:spring-beans:5.3.9 (*)
|    |    |         +--- org.springframework:spring-core:5.3.9 (*)
|    |    |         \--- org.springframework:spring-expression:5.3.9
|    |    |              \--- org.springframework:spring-core:5.3.9 (*)
|    |    +--- org.springframework.boot:spring-boot-autoconfigure:2.5.3
|    |    |    \--- org.springframework.boot:spring-boot:2.5.3 (*)
|    |    +--- org.springframework.boot:spring-boot-starter-logging:2.5.3
|    |    |    +--- ch.qos.logback:logback-classic:1.2.4
|    |    |    |    +--- ch.qos.logback:logback-core:1.2.4
|    |    |    |    \--- org.slf4j:slf4j-api:1.7.31 -> 1.7.32
|    |    |    +--- org.apache.logging.log4j:log4j-to-slf4j:2.14.1
|    |    |    |    +--- org.slf4j:slf4j-api:1.7.25 -> 1.7.32
|    |    |    |    \--- org.apache.logging.log4j:log4j-api:2.14.1
|    |    |    \--- org.slf4j:jul-to-slf4j:1.7.32
|    |    |         \--- org.slf4j:slf4j-api:1.7.32
|    |    +--- jakarta.annotation:jakarta.annotation-api:1.3.5
|    |    +--- org.springframework:spring-core:5.3.9 (*)
|    |    \--- org.yaml:snakeyaml:1.28
|    +--- org.apache.tomcat.embed:tomcat-embed-el:9.0.50
|    \--- org.hibernate.validator:hibernate-validator:6.2.0.Final
|         +--- jakarta.validation:jakarta.validation-api:2.0.2
|         +--- org.jboss.logging:jboss-logging:3.4.1.Final -> 3.4.2.Final
|         \--- com.fasterxml:classmate:1.5.1
+--- org.springframework.boot:spring-boot-starter-web -> 2.5.3
|    +--- org.springframework.boot:spring-boot-starter:2.5.3 (*)
|    +--- org.springframework.boot:spring-boot-starter-json:2.5.3
|    |    +--- org.springframework.boot:spring-boot-starter:2.5.3 (*)
|    |    +--- org.springframework:spring-web:5.3.9
|    |    |    +--- org.springframework:spring-beans:5.3.9 (*)
|    |    |    \--- org.springframework:spring-core:5.3.9 (*)
|    |    +--- com.fasterxml.jackson.core:jackson-databind:2.12.4
|    |    |    +--- com.fasterxml.jackson.core:jackson-annotations:2.12.4
|    |    |    |    \--- com.fasterxml.jackson:jackson-bom:2.12.4
|    |    |    |         +--- com.fasterxml.jackson.core:jackson-annotations:2.12.4 (c)
|    |    |    |         +--- com.fasterxml.jackson.core:jackson-core:2.12.4 (c)
|    |    |    |         +--- com.fasterxml.jackson.core:jackson-databind:2.12.4 (c)
|    |    |    |         +--- com.fasterxml.jackson.datatype:jackson-datatype-jdk8:2.12.4 (c)
|    |    |    |         +--- com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.12.4 (c)
|    |    |    |         \--- com.fasterxml.jackson.module:jackson-module-parameter-names:2.12.4 (c)
|    |    |    +--- com.fasterxml.jackson.core:jackson-core:2.12.4
|    |    |    |    \--- com.fasterxml.jackson:jackson-bom:2.12.4 (*)
|    |    |    \--- com.fasterxml.jackson:jackson-bom:2.12.4 (*)
|    |    +--- com.fasterxml.jackson.datatype:jackson-datatype-jdk8:2.12.4
|    |    |    +--- com.fasterxml.jackson.core:jackson-core:2.12.4 (*)
|    |    |    +--- com.fasterxml.jackson.core:jackson-databind:2.12.4 (*)
|    |    |    \--- com.fasterxml.jackson:jackson-bom:2.12.4 (*)
|    |    +--- com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.12.4
|    |    |    +--- com.fasterxml.jackson.core:jackson-annotations:2.12.4 (*)
|    |    |    +--- com.fasterxml.jackson.core:jackson-core:2.12.4 (*)
|    |    |    +--- com.fasterxml.jackson.core:jackson-databind:2.12.4 (*)
|    |    |    \--- com.fasterxml.jackson:jackson-bom:2.12.4 (*)
|    |    \--- com.fasterxml.jackson.module:jackson-module-parameter-names:2.12.4
|    |         +--- com.fasterxml.jackson.core:jackson-core:2.12.4 (*)
|    |         +--- com.fasterxml.jackson.core:jackson-databind:2.12.4 (*)
|    |         \--- com.fasterxml.jackson:jackson-bom:2.12.4 (*)
|    +--- org.springframework.boot:spring-boot-starter-tomcat:2.5.3
|    |    +--- jakarta.annotation:jakarta.annotation-api:1.3.5
|    |    +--- org.apache.tomcat.embed:tomcat-embed-core:9.0.50
|    |    +--- org.apache.tomcat.embed:tomcat-embed-el:9.0.50
|    |    \--- org.apache.tomcat.embed:tomcat-embed-websocket:9.0.50
|    |         \--- org.apache.tomcat.embed:tomcat-embed-core:9.0.50
|    +--- org.springframework:spring-web:5.3.9 (*)
|    \--- org.springframework:spring-webmvc:5.3.9
|         +--- org.springframework:spring-aop:5.3.9 (*)
|         +--- org.springframework:spring-beans:5.3.9 (*)
|         +--- org.springframework:spring-context:5.3.9 (*)
|         +--- org.springframework:spring-core:5.3.9 (*)
|         +--- org.springframework:spring-expression:5.3.9 (*)
|         \--- org.springframework:spring-web:5.3.9 (*)
+--- org.flywaydb:flyway-core -> 7.7.3
+--- org.mybatis.spring.boot:mybatis-spring-boot-starter:2.2.0
|    +--- org.springframework.boot:spring-boot-starter:2.5.0 -> 2.5.3 (*)
|    +--- org.springframework.boot:spring-boot-starter-jdbc:2.5.0 -> 2.5.3
|    |    +--- org.springframework.boot:spring-boot-starter:2.5.3 (*)
|    |    +--- com.zaxxer:HikariCP:4.0.3
|    |    |    \--- org.slf4j:slf4j-api:1.7.30 -> 1.7.32
|    |    \--- org.springframework:spring-jdbc:5.3.9
|    |         +--- org.springframework:spring-beans:5.3.9 (*)
|    |         +--- org.springframework:spring-core:5.3.9 (*)
|    |         \--- org.springframework:spring-tx:5.3.9
|    |              +--- org.springframework:spring-beans:5.3.9 (*)
|    |              \--- org.springframework:spring-core:5.3.9 (*)
|    +--- org.mybatis.spring.boot:mybatis-spring-boot-autoconfigure:2.2.0
|    |    \--- org.springframework.boot:spring-boot-autoconfigure:2.5.0 -> 2.5.3 (*)
|    +--- org.mybatis:mybatis:3.5.7
|    \--- org.mybatis:mybatis-spring:2.0.6
+--- org.mybatis:mybatis-typehandlers-jsr310:1.0.2
+--- org.codehaus.groovy:groovy:3.0.8
+--- org.modelmapper:modelmapper:2.4.4
\--- com.google.code.findbugs:jsr305:3.0.2

(c) - dependency constraint
(*) - dependencies omitted (listed previously)
```


> `(*)` 표시는 이미 의존성 트리가 한 번 출력되었기 때문에 생략했다는 표시이다.

위의 결과에서 주목해야할 표기는 두 가지가 있다.

#### dependency constraint

의존성 목록 중에서 `(c)` 표시는 dependency constraint로 gradle이 마음대로 버전을 바꿀 수 없다는 것을 나타낸다.

#### A `->` B

`org.springframework.boot:spring-boot-autoconfigure:2.5.0 -> 2.5.3 (*)` 와 같은 표기가 출력 곳곳에 있다. 의존성 트리를 보면 
프로젝트가 `org.springframework.boot:spring-boot-autoconfigure:2.5.3`를 참고하고 있는 것을 볼 수 있다. 
Transitive 의존성이 자동으로 변경된 것이다. 

### 의존성 관리하기

이처럼 gradle이 자동으로 transitive 의존성의 버전 관리를 하기 때문에, 어떤 모듈의 버전을 변경하면 다른 모듈에도 영향을 줄 수 있다는 사실을 알 수 있다. 
이런 사실때문에 의존성을 변경한 것이 내 코드에 영향을 주는지 알아야 하기 때문에 테스트가 필요한 것이다.

#### Gradle의 버전 충돌 해결

[gradle 공식 문서 - dependency resolution](https://docs.gradle.org/current/userguide/dependency_resolution.html)에 소개된 
사례가 있다. 

> - 같은 `com.google.guava:guava` 모듈에 의존하고 있다고 가정하자.
> - 그런데 하나는 `20.0` 이고, 다른 하나는 `25.1-android` 버전이다.
>     - 프로젝트는 `com.google.guava:guava:20.0` 에 의존하고 있다.
>     - 프로젝트가 의존하고 있는 `com.google.inject:guice:4.2.2`는 `com.google.guava:guava:25.1-android`를 의존성으로 가진다. 

위와 같은 상황에서 버전을 선택하거나 의존성 resolution에 실패하는 두 가지 방법이 있다. Gradle은 의존성 그래프에서 발견되는 모든 버전을 고려하므로, 
가장 최신버전을 선택한다.

#### 그 외

Gradle 공식 문서에 다양한 상황에서의 의존성 해결 방법이 문서화 되어 있다. 

- [Transitive 의존성 업그레이드](https://docs.gradle.org/current/userguide/dependency_constraints.html)
- [후보가 되는 버전 중 하나 선택하기 - Selecting between candidates](https://docs.gradle.org/current/userguide/dependency_capability_conflict.html#sub:selecting-between-candidates)

## 기타 참고할 자료

- [몬드의 개발로그 — 앱의 의존성 확인하고 전이 의존성 변경하기](https://mond-al.github.io/dependency-gradle-setup)
