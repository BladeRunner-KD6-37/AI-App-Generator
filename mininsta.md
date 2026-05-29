
{
  "appName": "MiniInstagram",

  "entities": [
    {
      "name": "User",
      "fields": [
        { "name": "username", "type": "string" },
        { "name": "bio", "type": "text" },
        { "name": "profileImage", "type": "image" }
      ]
    },

    {
      "name": "Post",
      "fields": [
        { "name": "caption", "type": "text" },
        { "name": "image", "type": "image" },
        { "name": "likes", "type": "number" }
      ]
    }
  ],

  "pages": [
    {
      "name": "FeedPage",
      "components": [
        {
          "type": "feed",
          "entity": "Post"
        }
      ]
    }
  ]
}
