---
title: libvirt deadlock 이슈 회고
date: "2021-06-22T21:58:40Z"
template: "post"
draft: true
slug: "libvirt deadlock 이슈 회고"
category: "Retrospection"
tags:
  - "Libvirt"
description: "Libvirt 와 레거시 프로젝트 사이에서 발생한 이슈를 바탕으로 생각을 정리해봤다."
socialImage: "/media/libvirt_logo.svg.png"
---

![libvirt-logo](/media/libvirt_logo.svg.png)

## 이슈 분석 과정

Libvirt 와 Libvirt 를 감싼 RPC 서버 컴포넌트 사이에 에러가 발생했다.

엔지니어들이 남겨둔 고객의 요청 정보와 로그, 그리고 코드를 분석해보니 RPC 서버에서 Libvirt 로 Domain Shutdown 요청을 날렸지만, 아무런 응답이 없었던 것으로 확인되었다.

이는 Shutdown 요청이 정상적으로 들어갔을 경우 출력되어야 할 로그 메시지가 없었기 때문에 이런 생각을 할 수 있었다.

운영 팀에 Libvirt 로그를 추가적으로 확인해달라고 요청했는데, `Timed out during operation: cannot acquire state change lock` 로그가 남아있는 것이 확인되었고, 잘 분석했음이 확인되는 순간이었다.

## 어떻게 해결해야 할까?

사실 Libvirt 에 남은 로그는 운영 팀에서 문제가 되는 VM을 `virsh` 커맨드를 사용하여 수동으로 제거할 때 남아있던 로그였다. RPC -> Libvirt 로 이어졌던 요청의 흐름과 크게 연관이 있는 것은 아니지만, 이 요청이 Libvirt Lock을 잡고 있었기 때문에 `virsh` 커맨드를 실행했을 때도 에러가 발생했던 것이다. 운영 팀장님에 따르면, 낮은 버전의 Libvirt + QEMU 에서 간혹 이런 Deadlock 이 의심되는 이슈가 종종 발생한다고 했다.

일단 구글링을 해보면 bugzila 에 올라온 케이스들을 봤을 때 원인을 정확하게 진단해주는 코멘트는 없었고, Libvirt 버전을 올리라는 답변 외에는 크게 얻을 것이 없었다.

그렇다면 가상화 자원을 서비스하는 자동화된 API를 제공하는 것이 미션인 내 입장에서는 블랙박스로 다룰 수 밖에 없는 하이퍼바이저를 외부에서 적절하게 에러 처리하는 것이 최선이었다.

그런데 레거시 코드는 RPC 클라이언트 측에서 응답이 너무 길어지면 연결을 끊어버리도록 설정이 되어있다. 실제로 클라이언트 측에서 연결을 끊은 로그도 발견이 되었다. 그렇다면 RPC 서버는 왜 계속 요청을 취소하지 않고 처리하고 있는 상황이었을까?

## 앞으로는..

일단 RPC 클라이언트가 연결을 끊었을 때, RPC 서버가 어떻게 동작하는지 확인할 필요가 있어보인다. RPC 서버가 쓰레드를 종료하는 것이 맞다면, Libvirt 에 보낸 요청에서 hang 이 발생한 것이니, Libvirt 요청을 취소할 수 있도록 코드를 다시 짜는 것이 맞을 것이다. Libvirt 요청을 취소할 수 있도록 변경하는 것은 Blocking 작업을 취소할 수 있는 쓰레드로 감싸는 것이 적절하다는 생각이 든다.

그리고 만약 RPC 클라이언트가 연결을 끊어도 RPC 서버는 쓰레드에 어떠한 처리도 하지 않는다면, 쓰레드를 중지 할 수 있는 방법을 찾아내야 할 것이다.
