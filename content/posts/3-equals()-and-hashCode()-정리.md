---
title: equals() & hashCode() 정리
date: "2021-07-07T22:08:09Z"
template: "post"
draft: false
slug: "3"
category: "Java"
tags:
  - "Java"
description: "Object 클래스의 핵심 메소드에 포함된 equals() 와 hashCode() 를 정리했다."
---

## `Object` 클래스의 `equals()`

`equals()`  메소드는 `Object`  클래스의 메소드 중 하나로, 두 객체 간 동일 비교에 사용한다. 그러나 최초 구현은 단순히 두 객체 간의 주소를 비교하게 되어 있다. 실제 `Object` 클래스의 `equals()`  메소드를 보면 다음과 같이 구현되어 있다.

```java
public boolean equals(Object obj) {
    return (this == obj);
}
```

즉, `Object` 클래스의 인스턴스로 `equals()` 를 사용하거나, 임의로 작성한 클래스에서 오버라이딩을 하지 않고 `equals()` 를 사용하면 주소 비교를 사용하게 되는 것이다.

## `equals()` 재정의

두 객체를 주소가 아닌 클래스가 가진 멤버들이 실제로 같은지 확인할 수 있게 하길 원한다면, `equals()` 메소드를 재정의해야 한다. 재정의할 때 지켜야할 조건이 있는데, 이는 `equals()` 메소드의 주석에도 자세히 설명돼 있다. `equals()` 를 재정의할 때 지켜야하는 조건은 총 다섯 가지이다.

- reflexive: null 이 아닌 x라는 객체의 x.equals(x) 는 항상 참이어야 한다.
- symmetric: null 이 아닌 x와 y 객체가 있을 때, y.equals(x) 가 참이면 x.equals(y) 도 참이어야 한다.
- transitive: null 이 아닌 x, y 그리고 z가 있을 때, x.equals(y) 가 참이고 y.equals(z) 가 참이면 x.equals(x) 는 반드시 참이어야 한다.
- consistent: null 이 아닌 x와 y가 있을 때, 객체가 변경되지 않았다면 x.equals(y) 의 결과는 항상 일관되어야 한다.
- null 제약 조건: null 이 아닌 x라는 객체의 x.equals(null) 의 결과는 항상 거짓이다.

실제로 재정의할 때는 위 조건을 지켜가며 직접 구현하지 않고 IDE의 도움을 받는 것이 일반적이다. 직접 구현한 코드가 제약조건을 지키지 못할 경우, 엄청난 일이 벌어질 수 있으므로(예를 들면, hash table을 사용하는 자료구조가 잘못 동작할 수 있다), IDE 기능을 사용하는 것이 좋다. 인텔리제이의 기능으로 `equals()` 를 재정의하면 다음과 같이 코드가 자동으로 작성된다.

```java
public class CustomClass {

    private final CustomClass1 customClass1 = new CustomClass1();
    private final int value1 = 0;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CustomClass)) return false;
        CustomClass that = (CustomClass) o;
        return value1 == that.value1 && customClass1.equals(that.customClass1);
    }

    ...
}
```

생성된 코드의 특징을 아래와 같이 정리해 볼 수 있었다.

- 주소가 같으면 같은 객체로 간주한다.
- 형변환하기 전에, 타입을 확인한다. 다른 타입이면 다른 객체이다.
- Primitive 타입의 멤버는 `==` 을 사용하고, Reference 타입의 멤버는 `equals()` 를 사용한다.

## `hashCode()`

인텔리제이에서 `equals()` 를 재정의할 때, `hashCode()` 도 같이 재정의된다. 왜 그래야만 할까?`hashCode()` 는 어떤 두 객체가 서로 동일하다면, 반드시 같은 값을 반환해야 하기 때문이다. `hashCode()` 의 주석을 확인해보면, `hashCode()` 가 지켜야 할 조건을 세 가지로 정리해두었는데, 앞의 동일성에 대한 조건도 세 가지 조건에 포함되어 있다.

1. 자바 애플리케이션이 수행되는 동안, 어떤 객체에 대해 이 메소드를 호출하면 항상 같은 int 값을 반환해야 한다. 그러나 자바를 실행할 때마다 같아야 할 필요는 없다.
2. 두 객체를 `equals()` 메소드로 비교했을 때 `true` 가 반환되었다면, 두 객체에 각각 `hashCode()` 를 호출했을 때 반환되는 결과는 서로 같아야 한다. 
3. `equals()` 메소드의 결과가 `false` 라고 반드시 `hashCode()` 메소드를 호출한 int 값이 서로 달라야 하는 것은 아니다. 하지만 다르게 값을 반환하면 hash table 의 성능을 향상시키는데 도움이 된다.

### `hashCode()` 가 반환하는 값

재정의하지 않으면 `hashCode()` 는 객체의 메모리 주소를 16진수로 리턴한다. IDE의 기능을 사용해 구현하면, 다음과 같이 코드가 자동으로 생성된다.

```java
public class CustomClass {

    private final CustomClass1 customClass1 = new CustomClass1();
    private final int value1 = 0;

    // ...

    @Override
    public int hashCode() {
        return Objects.hash(customClass1, value1);
    }
}
```

## `String` 의 `equals()`

`String` 인스턴스를 생성하는 방법은 String literal (쌍따옴표로 감싼 문자열)과 생성자를 사용하는 방법이다. 그런데 전자는 constant pool 을 사용하여 초기화하고 후자는 실제로 힙에 새로운 인스턴스를 할당하는 차이가 있다. 그렇다면 두 가지 인스턴스를 만들고 `equals()` 를 사용하면 어떻게 될까?

테스트를 작성하고 확인해봤다.

```java
class StringTest {

    @Test
    void compareStringLiteralAndNewString() {

        assertThat("test" == new String("test")).isFalse();
        assertThat("test".equals(new String("test"))).isTrue();
        
    }

}
```

실행해보면 테스트는 잘 통과한다. 주소값을 비교하면, 두 문자열이 다른 메모리 공간에 생길 것이므로 `false` 가 결과일 것은 자명하다. 반면 `equals()` 를 사용한 비교 결과는 `true` 이다. 나온 결과에 따라 추측해보면, `String` 은 이미 `equals()` 가 재정의되었다고 생각할 수 있다. 이를 확인해보니, 실제로 `equals()` 가 이미 재정의되어 있었다.

```java
public final class String {
	
	// ...

	public boolean equals(Object anObject) {
        if (this == anObject) {
            return true;
        }
        if (anObject instanceof String) {
            String anotherString = (String)anObject;
            int n = value.length;
            if (n == anotherString.value.length) {
                char v1[] = value;
                char v2[] = anotherString.value;
                int i = 0;
                while (n-- != 0) {
                    if (v1[i] != v2[i])
                        return false;
                    i++;
                }
                return true;
            }
        }
        return false;
    }

    // ...
}
```

실제 구현은 주소 값을 먼저 비교하고, 다를 경우 문자열에 들어있는 모든 char 를 비교하도록 구현되어 있다.

## 정리

- 동등 연산자( `==` ) 는 reference type 일 때 주소 값을 비교한다.
- 동일 연산에 사용하는 `equals()` 의 원래 구현은 주소 값을 비교한다.
- Reference type 의 인스턴스를 서로 비교할 때, 내부 멤버까지 같은지 확인하고 싶다면 `equals()` 를 직접 구현해야 한다.
- `equals()` 와 `hashCode()` 는 재정의할 경우 반드시 지켜야할 규칙이 존재한다.
- `hashCode()` 는 `equals()` 가 `true` 를 반환한 두 객체에 대해, 항상 같은 int 값을 반환해야 하는 조건이 있다.
- `String` 클래스는 이미 `equals()` 를 재정의했다. 실제 문자열을 비교하도록 구현되어 있다.
