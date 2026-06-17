export interface Location {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  description?: string
  created_at: string
}

export interface Video {
  id: string
  location_id: string
  youtube_id: string
  title: string
  thumbnail: string
  channel: string
  published_at: string
  created_at: string
}

export interface Profile {
  id: string
  nickname: string
  avatar_url?: string
  role: 'user' | 'admin'
  created_at: string
}
