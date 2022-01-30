---
title: Fream 1차 프로젝트 CI/CD 구축
date: "2022-01-29T12:40:20Z"
template: "post"
draft: false
slug: "28"
category: "fream"
tags:
  - "토이프로젝트"
  - "fream"
description: "Fream 앱의 1차 프로젝트 배포 과정을 기록했다."
---

## 개요

프로젝트를 구상하는 단계에서 GitHub Flow를 사용하여 브랜치를 관리하기로 결정했었다. 다른 후보로는 Git Flow도 있었지만 특별히 많은 브랜치를 유지할 필요는 없다고 판단해 간단한 GitHub Flow를 선택했다.

이 선택에 따라서 CI/CD를 구축하기 위해 다음과 같이 구상했다.

- CI
    - 대상: `main` 브랜치를 타겟으로하는 모든 PR
    - 파이프라인
        - 코딩 컨벤션 확인: CheckStyle을 활용하여 google convention 적용
        - 유닛, 통합 테스트 실행
        - 커버리지 확인: 라인, 브랜치 커버리지 100% 유지
- CD
    - 대상: `main` 브랜치
    - 파이프라인
        - 도커 이미지 빌드
        - 원격 서버로 배포

### CI 구축

앞서 언급한 CI 파이프라인은 각각을 개별 단계로 보지 않고 gradle 명령어 한 번으로 확인할 수 있게 미리 작업해두었다. 다음 명령어를 실행하면 세 가지 사항을 한 번에 확인할 수 있다. 

```sh
$ ./gradlew check
```

그 다음에 해야할 일은 그저 위 명령어를 PR 생성 또는 PR에 새로운 커밋이 생길 때마다 검증해주면 되는 것이다.

#### CI Jenkins 파이프라인 구축

PR에 CI를 실행하는 가장 쉬운 방법은 `GitHub Pull Request Builder` 플러그인을 사용하는 것이다. Jenkins에 해당 플러그인을 설치한 뒤 파이프라인을 설정한다. 

설정하는 방법은 다음과 같다.

1. `General` 탭에서 `GitHub Project`를 체크하고 프로젝트 URL을 입력한다.
    ![1.png](/media/2022-29-01/1.png)
2. `Build Triggers` 탭에서 `GitHub Pull Request Builder`를 선택한다.
    - `GitHub API credentials`에서 적절한 credential을 선택한다. 이것은 Dashboard > Manage Jenkins > Configure System 페이지로 들어가서 `GitHub Pull Request Builder`를 입력해줘야만 나온다. 
    <figure>
        <img alt="7.png" src="/media/2022-29-01/7.png" />
        <figcaption>
          `GitHub Pull Request Builder` credentials 설정하는 화면. <br>
          GitHub API 토큰도 미리 등록해두어야 `Credentials`에서 드롭다운으로 선택할 수 있다.
        </figcaption>
    </figure>
    - `Admin list`에는 프로젝트에 기여하는 GitHub 유저 이름을 입력한다. 일치하는 유저만 CI가 실행될 것이다.
    - `Use github hooks for build triggering` 항목에 체크한다. 이것을 체크하면 webhook이 트리거될 때 CI가 실행된다.
    ![2.png](/media/2022-29-01/2.png)
3. `GitHub Pull Request Builder` 의 `Trigger Setup` 버튼을 눌러 추가 설정해준다.
    - `Commit Status Context`에 적은 텍스트는 GitHub PR에 Build Status 제목으로 출력된다.
    ![4.png](/media/2022-29-01/4.png)
    <figure>
        <img alt="3.png" src="/media/2022-29-01/3.png" />
        <figcaption>
          `Commit Status Context`에 적은 텍스트가 출력되는 모습
        </figcaption>
    </figure>
    - `Commit Status Build Result` 에 빌드 결과에 따른 메시지를 입력해준다.
    ![5.png](/media/2022-29-01/5.png)
4. 파이프라인 스크립트를 작성한다.

#### Webhook 설정

`GitHub Pull Request Builder`를 사용하여 파이프라인을 구성할 때, webhook을 사용하겠다는 옵션에 체크했었다. 이를 실제로 사용하기 위해서는 GitHub 프로젝트에 Webhook 설정을 해줘야 한다. GitHub 레포리토리에서 Settings > Webhooks로 접근할 수 있다.

Webhook 페이지에서 `Add webhook`을 누른 후, `Payload URL` 에 `http://<jenkins_url>/ghprbhook` 을 입력해준다. 그리고 `Let me select individual events.` 라디오버튼을 누른 뒤, `Pull requests`에 체크하여 PR 생성 시 webhook이 전송되도록 설정한다. 

![6.png](/media/2022-29-01/6.png)

#### PR 파이프라인 스크립트

테스트를 실행할 때, `test-containers` 를 의존성으로 사용하여 통합 테스트에 활용하고 있었다. 때문에 파이프라인을 실행할 때 Docker in Docker 기능이 필요했는데, 이는 도커 소켓 파일을 마운트하여 해결했다. 또한 소켓 파일을 도커 내부에서 사용하기 위해서는 호스트의 `docker` 그룹 ID를 컨테이너 내부에서도 사용할 수 있어야 했다. 따라서 Jenkins가 설치된 서버의 `docker` 그룹의 ID를 확인해 넣어 주었다.

```groovy
pipeline {
    agent { 
        docker {
            image 'openjdk:11.0.13-slim' 
            args  '--network="host" -v /var/run/docker.sock:/var/run/docker.sock --group-add 118' # 호스트의 docker group id
        } 
    }
    
    environment {
        SPRING_PROFILES_ACTIVE = 'test'
    }

    
    stages {
        stage('Checkout') {
            steps {
                git branch: "${ghprbSourceBranch}",
                url: 'https://github.com/f-lab-edu/fream.git'
            }
        }

        stage('Build') {
            steps {
                sh ' ./gradlew clean check -i'
            }
        }
    }
    
    post {
        always {
            archiveArtifacts artifacts: 'build/reports/**/*.*', onlyIfSuccessful: true
        }
    }
}
```

### CD 구축

CD 는 PR이 `main` 브랜치에 병합될 때 실행되는 것으로 생각했다. 즉, `main` 브랜치가 커밋될 때에만 실행되어야 하는 것이다. 

이를 Jenkins에서 가능하게 해주는 플러그인은 `Generic Webhook Trigger`이다. `Push` 이벤트가 발생했을 때, Jenkins로 webhook을 전송하도록 GitHub 레포지토리에 설정하면, 특정 규칙에 따라 그 이벤트를 처리할 수도 있고, 그렇지 않을 수도 있다. 

[여러 가지 활용 방법](https://github.com/jenkinsci/generic-webhook-trigger-plugin/tree/master/src/test/resources/org/jenkinsci/plugins/gwt/bdd)을 예시로 제공하고 있으며, 그 중 특정 브랜치에만 파이프라인을 실행하는 예제를 사용해 CD를 구축했다.

#### CD Jenkins 파이프라인 구축

먼저 CI 파이프라인을 구축할 때와 동일하게 `General` 탭에서 `GitHub Project`를 체크하고 프로젝트 URL을 한다. 그런 다음, `Build Triggers` 에서 `Generic Webhook Trigger`를 체크한 다음, 특정 브랜치에서만 트리거가 되도록 설정해주어야 한다. 

- `Post content paramters`에 webhook request body 중 어떤 프로퍼티를 사용할지 지정해야 한다. 브랜치 이름이 필요하므로, 다음과 같이 설정해주었다.
    ![8.png](/media/2022-29-01/8.png)
- 그 다음, 토큰을 입력해준다. 이 토큰은 jenkins 유저 중 권한있는 유저의 API 토큰이어야 한다. `token` 에 값을 넣거나, `token credential` 을 사용하면 된다. 보안을 위해, `token credential`을 사용하는 것이 더 적절해보인다.
    ![9.png](/media/2022-29-01/9.png)
- 마지막으로, `Optional filter`를 설정해준다. `Expression`과 `Text` 항목이 있는데, 여기에 들어갈 값은 플러그인 개발자가 작성한 예시를 따라하는 것이 편하다. 브랜치 이름을 기준으로 필터링해야 하므로, 이 [문서](https://github.com/jenkinsci/generic-webhook-trigger-plugin/blob/master/src/test/resources/org/jenkinsci/plugins/gwt/bdd/github/github-push-specific-branches.feature)를 참고했다.
    ![10.png](/media/2022-29-01/10.png)

#### Webhook 설정

CI를 실행하기 위해 webhook을 설정했던 것처럼, 이번에도 마찬가지로 webhook을 설정해야 한다. 

Webhook을 받을 URL은 플러그인에서 제시하는 고정된 Payload URL을 사용하고, 토큰을 쿼리 파라미터나 헤더 등에 포함시켜주면 된다. 
URL 예시는 다음과 같다.

```url
https://<JENKINS_URL>/generic-webhook-trigger/invoke?token=123asd
```

그리고 Request Body의 특정 키에 접근하기 위해 JSON Path를 사용했으므로, `Content Type` 은 반드시 `application/json` 으로 설정해야 한다.

![11.png](/media/2022-29-01/11.png)

#### CD 파이프라인 스크립트

`main` 브랜치는 임의로 push 할 수 없고 반드시 PR을 병합해야만 하기 때문에 `main` 브랜치는 항상 CI를 통과한 상태라고 볼 수 있다. 따라서 CD 파이프라인에는 컨벤션 확인, 테스트 실행 등의 과정을 제외시키고, 도커 이미지 빌드와 원격 서버에 스크립트 실행 작업만을 파이프라인에 넣었다. 

```groovy
pipeline {
    agent any

    environment {
        IMAGE_REGISTRY_HOST = credentials('image-registry-host')
        IMAGE_REGISTRY_PORT = credentials('image-registry-port')
        FREAM_APP_SERVER_HOST = credentials('fream-app-server-host')
        FREAM_APP_SERVER_USER = credentials('fream-app-server-user')
    }

    stages {

        stage('check env') {
            when {
                anyOf {
                    expression { env.IMAGE_NAME == null }
                    expression { env.IMAGE_REGISTRY_HOST == null }
                    expression { env.IMAGE_REGISTRY_PORT == null }
                    expression { env.FREAM_APP_SERVER_HOST == null }
                    expression { env.FREAM_APP_SERVER_USER == null }
                    expression { env.SCRIPT_DIR == null }
                }
            }
            steps {
                script {
                    error 'Some required env are not set.'
                }
            }
        }

        stage('clone the project') {
            steps {
                git branch: 'main', url: 'https://github.com/f-lab-edu/fream.git'
            }
        }

        stage('fetch a version') {
            steps {
                script {
                    env.FREAM_VERSION = sh(returnStdout: true, script: ''' ./gradlew properties | grep \'^version:\\ \' | awk \'{print $2}\' ''').trim()
                }
            }
        }

        stage('create image') {
            steps {
                sh '''
                    IMAGE_REGISTRY="$IMAGE_REGISTRY_HOST:$IMAGE_REGISTRY_PORT"

                    ./gradlew clean bootJar

                    docker build --build-arg FREAM_VERSION=$FREAM_VERSION --no-cache -t $IMAGE_REGISTRY/$IMAGE_NAME:$FREAM_VERSION .
                    docker tag $IMAGE_REGISTRY/$IMAGE_NAME:$FREAM_VERSION $IMAGE_REGISTRY/$IMAGE_NAME:latest

                    docker push $IMAGE_REGISTRY/$IMAGE_NAME:$FREAM_VERSION
                    docker push $IMAGE_REGISTRY/$IMAGE_NAME:latest

                    docker rmi $(docker images -f "dangling=true" -q) || true

                '''
            }
        }

        stage ('Deploy') {
            steps {
                sshagent(credentials : ['fream-app-server-01-key']) {
                    sh 'ssh -o StrictHostKeyChecking=no "$FREAM_APP_SERVER_USER@$FREAM_APP_SERVER_HOST" "cd $SCRIPT_DIR ; ./020-deploy-fream.sh $FREAM_VERSION"'
                }
            }
        }

    }

}
```

## Conclusion

이렇게 CI/CD 파이프라인을 Jenkins를 사용하여 구축할 수 있었다. 

![12.png](/media/2022-29-01/12.jpeg)

CD 파이프라인의 마지막 단계에서 실행하는 스크립트로 무중단 배포를 수행하도록 구성해두었다. 이에 대한 이야기는 [다음 글](/posts/29)에 작성해두었다.
