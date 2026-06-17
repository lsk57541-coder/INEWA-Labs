declare namespace kakao {
  namespace maps {
    class Map {
      constructor(container: HTMLElement, options: MapOptions)
      setCenter(latlng: LatLng): void
      getCenter(): LatLng
      setLevel(level: number): void
      getLevel(): number
    }

    class LatLng {
      constructor(lat: number, lng: number)
      getLat(): number
      getLng(): number
    }

    class Marker {
      constructor(options: MarkerOptions)
      setMap(map: Map | null): void
      getPosition(): LatLng
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions)
      open(map: Map, marker: Marker): void
      close(): void
    }

    interface MapOptions {
      center: LatLng
      level: number
    }

    interface MarkerOptions {
      position: LatLng
      map?: Map
      image?: MarkerImage
    }

    interface MarkerImageOptions {
      offset?: Point
    }

    class MarkerImage {
      constructor(src: string, size: Size, options?: MarkerImageOptions)
    }

    class Point {
      constructor(x: number, y: number)
      getX(): number
      getY(): number
    }

    class Size {
      constructor(width: number, height: number)
    }

    interface InfoWindowOptions {
      content: string | HTMLElement
      removable?: boolean
    }

    interface MouseEvent {
      latLng: LatLng
    }

    interface CircleOptions {
      center: LatLng
      radius: number
      strokeWeight?: number
      strokeColor?: string
      strokeOpacity?: number
      fillColor?: string
      fillOpacity?: number
    }

    class Circle {
      constructor(options: CircleOptions)
      setMap(map: Map | null): void
    }

    interface CustomOverlayOptions {
      position: LatLng
      content: string | HTMLElement
      map?: Map
      zIndex?: number
      yAnchor?: number
      xAnchor?: number
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions)
      setMap(map: Map | null): void
      setContent(content: string | HTMLElement): void
      setPosition(latlng: LatLng): void
      getPosition(): LatLng
    }

    namespace event {
      function addListener(target: object, type: string, handler: (...args: unknown[]) => void): void
      function removeListener(target: object, type: string, handler: (...args: unknown[]) => void): void
    }

    function load(callback: () => void): void
  }
}

interface KakaoShareLinkOptions {
  mobileWebUrl: string
  webUrl: string
}

interface KakaoShareFeedOptions {
  objectType: 'feed'
  content: {
    title: string
    description?: string
    imageUrl: string
    link: KakaoShareLinkOptions
  }
  buttons?: {
    title: string
    link: KakaoShareLinkOptions
  }[]
}

declare const Kakao: {
  init(jsKey: string): void
  isInitialized(): boolean
  Share: {
    sendDefault(options: KakaoShareFeedOptions): void
  }
}
