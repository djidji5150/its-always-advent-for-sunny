# It's Always Advent for Sunny

An advent calendar for Sunčica. One home-cooked meal a day, from 6 December through 30 December 2026. Each door opens at 8:00 in the morning, Belgrade time.

25 December is the Harry Potter door. The window dresses itself — you only add the meal.

Live site: https://djidji5150.github.io/its-always-advent-for-sunny/

## Add a meal

Edit `js/recipes.js`.

```js
window.RECIPES = {
  "2026-12-06": {
    title: "Sataraš",
    note: "Extra pepper, the way you like it.",
    serves: "2",
    time: "40 min",
    ingredients: ["4 peppers", "1 onion", "2 eggs"],
    steps: [
      "Soften the onion.",
      "Stew the peppers until sweet.",
      "Fold in the eggs."
    ],
    image: "images/day-06.jpg",
    imageAlt: "A pan of sataraš"
  }
};
```

`note`, `serves`, `time`, `image`, and `imageAlt` can be left out. Photos go in an `images` folder, or use an `https` link.

## Preview a door

Real doors stay shut until 8:00 on their own day. While you are writing recipes:

- `?preview=2026-12-25` shows that morning as if it were midday
- `?preview=open` unlocks the whole calendar

Send Sunny the link without a preview query.
