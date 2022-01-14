---
title: ModelMapper 도입과 동작 방식
date: "2021-12-27T21:07:17Z"
template: "post"
draft: false
slug: "26"
category: "fream"
tags:
  - "토이프로젝트"
  - "fream"
description: "Fream 프로젝트에서 ModelMapper 를 도입한 이유와 동작 방식에 대해 적어보았다."
---

## ModelMapper 란?

비슷하게 구성되어 있지만 구조와 관심사가 서로 다른 두 모델을 쉽게 변환해주기 위한 매핑 프레임워크.

### 프로젝트 도입

서비스 레이어에서 비즈니스 로직을 수행한 다음, 그 결과를 반환하기 위해 엔티티 클래스를 DTO로 변환하여 반환하는 작업을 프로젝트에서 자주 수행했었다. 

그리고 DTO의 목적에 맞게 비즈니스 로직을 클래스에서 제거하고, 클래스 내부에 서비스 또는 도메인에 속한 클래스를 import하지 않도록 강제하여 의존성을 완전히 제거히려 했다. 이렇게 하기 위해서는 엔티티 클래스에서 직접 DTO를 만드는 메소드를 작성해야 했다. 

```java
public class Product {
    private Long id;
    private String name;
    private String englishName;
    private Category category;
    private ProductDetails details;
    private Brand brand;
    private Sizes sizes;

    // ...

    public ProductDto export() {
        return new ProductDto(
            // ...
        );
    }
}

```

엔티티마다 유사한 작업을 반복해야하고 DTO로 변환하는 책임이 부여된다는 점 때문에 이를 제거하고 싶었다. 거기서 찾은 것이 바로 *ModelMapper*이다. ModelMapper와 같은 매핑 프레임워크는 여럿 있었지만, 간단하게 사용할 수 있다는 점 때문에 채택하게 되었다.

> 참고 - [매핑 프레임워크 성능 비교](https://www.baeldung.com/java-performance-mapping-frameworks) 

### ModelMapper의 동작 방식

http://modelmapper.org/user-manual/how-it-works/#matching-process

ModelMapper는 두 번의 프로세스 - matching, mapping 를 거쳐 객체를 다른 객체로 변환한다. 

#### Matching process

이 프로세스에서는 `ModelMapper` 또는 `TypeMap` 인스턴스에 설정한 규약을 사용하여 두 객체 사이의 프로퍼티를 매칭한다. 이 프로세스에서는 적합한 속성을 식별하고 이름을 변환하고 토큰화한 다음, 해당 토큰을 사용하여 소스 객체와 타겟 객체가 일치하는지 확인하는 방식으로 작동한다.

##### 적합한 속성 식별

두 단계를 거쳐 적합한 속성을 결정한다.

필드 매칭이 활성화되어 있다면 `AccessLevel`에 따라 접근할 수 있는 필드를 고르고 그 중에서 `NamingConvention` 에 따라 적절한 필드를 선정한다. 메소드도 이와 같은 방식을 따른다. 단, 변환될 프로퍼티 이름이 같다면 우선 순위는 메소드가 필드보다 높다.

##### 변환

매칭하기 전에, **NameTransformer** 를 사용해 프로퍼티 이름을 다른 이름으로 변환할 수 있다. 따라서 소스 객체와 타겟 객체의 서로 다른 컨벤션을 매치시킬 수 있다.

##### 토큰화

변환 후, **NameTokenizer** 로 클래스와 프로퍼티를 토큰화하여 매칭에 사용한다.

##### 매칭

`MatchingStrategies` 에 따라 소스 객체와 타겟 객체의 프로퍼티를 매치한다. 매칭 전략의 자세한 내용은 [문서](http://modelmapper.org/user-manual/configuration/#matching-strategies)에 작성되어 있다. 

##### 모호한 프로퍼티

소스 객체의 여러 프로퍼티가 타겟 객체의 프로퍼티 하나에 매칭되는 등의 모호함이 있을 수 있다. 이런 경우 매칭 엔진은 중복된 것 중 가장 유사한 것을 선택한다.

#### Mapping process

아래 항목 중 하나에 따라 매핑된다. 가장 먼저 조건이 일치한 항목대로 매핑된다.

- 소스 또는 타겟 타입에 `TypeMap` 이 존재하면 `TypeMap`에 정의된 `Mapping` 에 따라 매핑한다.
- `Converter` 가 존재하고 소스 객체를 타겟 타입으로 변환할 수 있으면 `Converter`를 사용하여 매핑한다.
- 새로운 `TypeMap` 이 소스와 타겟 타입에 생성되면 `TypeMap`에 캡처된 `Mapping`을 암시적으로 사용하여 매핑한다.

### Special case - 제네릭 타입은 어떻게 매핑되는가?

```java
public List<AuctionDto> getAuctions(AuctionSearchOption searchOption) {
    List<Auction> auctions = auctionMapper.getAuctions(searchOption);

    return modelMapper.map(auctions, new TypeToken<List<Auction>>(){}.getType());
}
```

리스트에 들어있는 타입을 다른 타입의 리스트로 변환하기 위해 코드를 위와 같이 작성했었다. 사용할 때는 별 문제가 없었지만, ModelMapper 동작 방식을 보다보니 궁금해져서 찾아보았다.


#### `TypeToken` 

ModelMapper는 제네릭 타입을 매핑하기 위해 `TypeToken`을 사용한다. 이것이 필요한 이유를 알아보자.

```java
List<Integer> integers = new ArrayList<Integer>();
integers.add(1);
integers.add(2);
integers.add(3);

List<Character> characters = new ArrayList<Character>();
modelMapper.map(integers, characters);
```

위의 예제를 실행하면 `characters`는 빈 리스트이다. 이는 제네릭스가 런타임에 type erasure가 발생하기 때문에 ModelMapper가 처리할 수 없는 상황이었던 것이다. 

따라서 ModelMapper는 컴파일 타임에 `TokenType`로 파라미터 타입을 보존하여 변환할 때 사용하는 것이다. 

> 참고 - [Baeldung - Mapping Lists with ModelMapper](https://www.baeldung.com/java-modelmapper-lists#2-type-token)
