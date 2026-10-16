import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import DiscoverView from "./views/DiscoverView.vue";
import LikedView from "./views/LikedView.vue";
import PlaylistView from "./views/PlaylistView.vue";
import SearchView from "./views/SearchView.vue";
import RecentView from "./views/RecentView.vue";
import DailyView from "./views/DailyView.vue";
import ArtistView from "./views/ArtistView.vue";
import AlbumView from "./views/AlbumView.vue";
import AlbumsView from "./views/AlbumsView.vue";
import "./style.css";
import "./immersive.css";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/artist/:id", component: ArtistView, meta: { title: "歌手" } },
    { path: "/artist/:id/songs", component: ArtistView, meta: { title: "全部歌曲" } },
    { path: "/album/:id", component: AlbumView, meta: { title: "专辑" } },
    { path: "/albums", component: AlbumsView, meta: { title: "收藏的专辑", account: true } },
    { path: "/", component: DiscoverView, meta: { title: "发现音乐" } },
    {
      path: "/liked",
      component: LikedView,
      meta: { title: "我喜欢的音乐", account: true },
    },
    { path: "/recent", component: RecentView, meta: { title: "最近播放" } },
    { path: "/daily", component: DailyView, meta: { title: "每日推荐", account: true } },
    { path: "/search", component: SearchView, meta: { title: "搜索" } },
    { path: "/playlist/:id", component: PlaylistView, meta: { title: "歌单" } },
    {
      path: "/playing",
      redirect: "/",
    },
  ],
});

createApp(App).use(createPinia()).use(router).mount("#app");
