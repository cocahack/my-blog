---
title: 중복 요청으로 발생한 NPE 문제 해결하기
date: '2021-10-09T07:35:49Z'
template: 'post'
draft: false
slug: '16'
category: "Log"
tags:
  - "Log"
description: '중복 요청이 일으킨 NPE를 분석하고 해결하는 과정을 기록했다.'

---

## Background 

### VM 정지

유저가 VM을 정지하는 요청을 보내면 서버 A가 이를 받아 VM이 위치한 서버에 실행 중인 서버 B로 RPC 요청을 보낸다. 서버 B는 `Libvirt API`를 사용해 VM 정지를 시도하고, 정상적으로 종료되면 서버 A로 응답을 보낸다. 

이를 Sequance diagram으로 나타내보면 다음과 같다.

![normal-sequance-diagram](/media/2021-10-09/1.png)

RPC 요청에는 3분의 타임아웃이 설정되어 있었으며, Libvirt API로 VM을 종료한 뒤 VM이 제거될 때까지 루프를 돌면서 확인하는 작업이 2분 30초 동안 지속된다. 항상 서버 B에서 타임아웃을 발생시키려고 의도한 것이 아닌가 추측된다.

### 정지 실패 Case

VM 정지는 항상 성공하지 않는다. 유저의 VM이 프로세스를 정지하고 있지만 시간이 오래 걸린다거나, 종료 요청 자체가 VM에 전달이 되지 않는 등 여러 문제가 있다. 이렇게 VM 정지 실패는 서버 애플리케이션의 문제가 아닐 때가 훨씬 많다.

VM 정지에 실패했을 때 애플리케이션의 흐름은 다음과 같다.

![timeout-during-terminating](/media/2021-10-09/2.png)

`Libvirt API`로 정지 명령을 보낸 후 2분 30초 동안 VM이 하이퍼바이저에서 제거되지 않으면 에러로 판단한다. VM이 아직 남아있는 상태이므로 VM이 사용 중인 볼륨이나 네트워크 설정도 제거하지 않는다.

---

## 문제 상황

VM 정지 요청이 연달아 두 번 들어오면서 NPE가 발생했고, VM이 정지되지 않았는데 관련 설정이 제거되었다.

`Libvirt API` 정지 명령이 성공하여 VM이 하이퍼바이저에서 제거되었거나, 특정 예외가 던져졌을 때 VM 관련 설정이 제거된다. VM 관련 설정을 제거하는 조건이 이상하다고 생각했지만, 조건을 변경하는 것은 테스트도 까다롭고 시간이 더 걸릴 것 같아 의도하지 않은 NPE를 제거하기로 결정했다.

### 코드 분석 

실제 코드를 가져올 수 없어 유사한 코드를 작성했다. 

```java
public class VMService {

    private Map<String, Boolean> MAP
            = new HashMap<>(); // 특정 vm 의 연산 성공 여부를 담으려고 시도함

    // ..

    public void terminate(String vmId) {

        // 1
        if (MAP.contains(vmId)) {
            throw new Exception();
        }
        MAP.put(vmId, false);

        // 2
        preTask();
        shutdownVm();
        
        // 3
        Callable<Boolean> job = () -> {
            while (true) {
                boolean vmState = getVmState(vmId);
                if (vmState) {
                    return vmState;
                }
                Thread.sleep(300);
            }
        };

        Future<Boolean> submit = executor.submit(job);
        try {
            Boolean result = submit.get(2500, TimeUnit.MILLISECONDS);
            MAP.put(vmId, result);
        } catch (Exception e) {
            MAP.put(vmId, false);
        }

        // 4
        if (MAP.get(vmId)) {
            afterTask();
        }
        
        // 5
        MAP.remove(vmId);
    }
}
```

위 코드의 작업 순서는 총 다섯 단계로 나뉜다. 

1. `HashMap`에 `vmId`에 해당하는 키가 존재하면 이미 작업 중인 것으로 간주하여 예외를 던진다. 서버 A에 이미 작업 중이라는 것을 응답으로 알려주게 된다. 키가 없으면 `false` 값과 함께 맵에 저장한다. 
2. `Libvirt API`를 사용하여 VM을 정지한다. VM Action과 관련된 `Libvirt API`는 VM 상태가 변할때 응답을 주는게 아니라 정상적으로 요청이 실행되었을 때 응답을 주는 것으로 보인다.
3. `Libvirt API`를 사용하여 VM 상태를 감시한다. VM이 제거되면 `true`를 반환한다. 이 작업은 2분 30초 동안 반복된다.
4. VM이 제거되면 따로 후처리를 진행한다.
5. 메소드를 리턴하기 전에 맵에 있던 키를 제거한다.

위 코드에서는 4번에서 NPE가 발생했다. 

![NPE 발생](/media/2021-10-09/3.png)

#### 원인

맵을 락으로 사용하고 종료 실행 결과를 담으려고 한 것이 결과적으로 NPE를 낳았다고 할 수 있다. 1번 단계에서는 VM 당 오직 하나의 연산만을 허용하는 락 기능을 수행할 수 없다.

때문에 두 쓰레드 이상이 4번과 5번 작업을 동시에 진행할 수 있으며, 키가 먼저 지워지는 경우 4번에서 키가 없기 때문에 `MAP.get(vmId)`가 `null`을 반환하고 `null`을 if문의 조건으로 썼기 때문에 NPE가 발생한 것이다.

#### 해결 방안

VM 정지를 실행하는 메소드와 이 메소드를 감싸는 외부 로직도 모두 중복 요청이 없을 것이라 가정하고 작성된 코드였다. 때문에 한 번에 한 쓰레드만 정지를 실행할 수 있도록 보장해주는 것이 가장 적절한 방법이라고 생각했다. 리팩토링을 할 수 있다면 더 좋겠지만, 일정 상 시간을 더 투입할 수 없어 이렇게 결정했다.

서버 B는 이중화 구성이 아니기 때문에 `static`을 사용하여 쓰레드가 공유할 수 있는 락을 사용하는 것이 가장 간단한 방법이었다. 그 대신, Lock 범위를 VM ID로 좁히기 위해 VM ID와 락을 맵으로하는 `ConcurrentMap`을 사용했다.

```java
public class VMService {

    private static final ConcurrentMap<String, ReentrantLock> LOCKS
            = new ConcurrentHashMap<>();

    // ...

    public String terminate(String vmId) {
        LOCKS.putIfAbsent(vmId, new ReentrantLock());

        ReentrantLock lock = LOCKS.get(vmId);
        if (lock.isLocked()) {
            return vmId + " is now working";
        }

        try {
            lock.lock();

            log.info("{} now works.", Thread.currentThread().getName());

            preTask();
            shutdownVm();

            Callable<Boolean> job = () -> {
                while (true) {
                    boolean vmState = getVmState(vmId);
                    if (vmState) {
                        return vmState;
                    }
                    Thread.sleep(300);
                }
            };

            Future<Boolean> submit = executor.submit(job);
            Boolean result = false;
            try {
                result = submit.get(2500, TimeUnit.MILLISECONDS);
                MAP.put(vmId, result);
            } catch (Exception e) {
                log.warn("Fail to get result due to " + e);
            }

            if (!result) {
                afterTask();
            }

            return "success";
        } finally {
            lock.unlock();
            log.info("{} released.", Thread.currentThread().getName());
        }

    }

}
```

VM ID를 키로 하여 `ReentrantLock`을 하나 씩 할당했다. 키를 집어넣을 때는 `putIfAbsent`를 사용하여 단 하나의 lock 객체를 사용할 수 있게 보장했다. 그리고 VM 종료를 수행하는 부분을 lock으로 제어하여 단 한 번의 연산만 허용하도록 강제했다. 부가적으로 VM 종료 실행 결과는 맵과 같은 컨테이너에 담지 않고 지역 변수를 활용했다.

위 코드를 실행해보면 로그가 다음과 같이 찍히게 된다. 

```
http-nio-8082-exec-1 now works.
Fail to get result due to java.util.concurrent.TimeoutException
http-nio-8082-exec-1 released.
http-nio-8082-exec-5 now works.
http-nio-8082-exec-5 released.
http-nio-8082-exec-8 now works.
Fail to get result due to java.util.concurrent.TimeoutException
http-nio-8082-exec-8 released.
http-nio-8082-exec-2 now works.
Fail to get result due to java.util.concurrent.TimeoutException
http-nio-8082-exec-2 released.
http-nio-8082-exec-6 now works.
http-nio-8082-exec-6 released.
http-nio-8082-exec-7 now works.
http-nio-8082-exec-7 released.
http-nio-8082-exec-9 now works.
Fail to get result due to java.util.concurrent.TimeoutException
http-nio-8082-exec-9 released.
...
```

한 번에 한 쓰레드만 동작하는 것을 볼 수 있다(`TimeoutException` 은 VM이 종료되지 않은 상황을 나타낸다).

##### 캐시

맵에 락을 저장하게 되면 프로세스를 재시작하지 않는 이상 계속 남아있을 것이다. 하지만 어떤 VM이 종료되고 나면 더 이상 그 키를 사용할 일이 없기 때문에 제거해주는 것이 좋다고 생각했다. 

`ConcurrentHashMap`을 사용한다면 명시적으로 키를 제거하는 방법 외에는 달리 방도가 없다. Guava 라이브러리의 `Cache`를 사용하여 일정 시간동안 접근되지 않은 키는 제거해주는 `eviction` 기능이 있으며, `Cache`를 `ConcurrentMap`로 다룰 수도 있기 때문에 적용하기가 매우 쉬웠다. 

```java
class SecondService {

    private static final Cache<String, ReentrantLock> CACHE;
    private static final ConcurrentMap<String, ReentrantLock> LOCKS;

    // ...

    static {
        CACHE = CacheBuilder.newBuilder()
                .expireAfterAccess(30, TimeUnit.SECONDS)
                .build();

        LOCKS = CACHE.asMap();
    }

    // ...
}
```

### 개선할 점

추가적으로 일정을 확보할 수 있게 된다면 아래 작업들을 해보려고 한다.

- 락 사용 범위 확대  
  VM 정지에 락을 사용하게 되었다. 그러나 VM에 사용할 수 있는 명령은 정지 외에도 더 많이 있다. 예를 들면 `restart`, `suspend` 등과 같은 VM 관리 명령이나, 네트워크 인터페이스 또는 스토리지 추가, 삭제 등 VM 관련 자원 제어 명령이 있을 수 있다.

  만약 VM 정지와 네트워크 인터페이스 추가와 같은 명령이 동시에 들어오게 된다면 한 명령은 VM과 관련된 설정을 모두 제거하려고 하고, 다른 명령은 네트워크 설정을 추가하려고 하는 상황이 발생할 수도 있다. 

  서버 A에서 DB를 사용해 논리적으로 VM 상태를 제어하고 있기는 하나, 보다 견고한 시스템을 위해 서버 B에도 VM 당 한 가지의 명령을 수행하도록 제어할 수 있는 수단을 마련하는 것이 바람직하다고 생각한다. 

- 다중화 적용    
  단일 서버로 운영하고 있어 `static` 객체로 동시성 제어가 가능했다. 만약 분산 환경에서 락이 필요하다면 분산 락을 도입해 볼 수 있을 것이다.
